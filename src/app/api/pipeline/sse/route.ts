import { NextRequest } from "next/server";
import { runPipelineWithGitHub } from "@/lib/agents/pipeline-github";
import { execute, queryOne } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

const ROLE_CN: Record<string, string> = {
  PM: "产品经理", TechLead: "技术负责人", Dev: "开发工程师",
  QA: "测试工程师", Ops: "运维工程师", Data: "数据分析师",
};

function buildDailyReportContent(
  productId: number,
  inputPrompt: string,
  messages: { role: string; content: string }[],
  summary: string
): string {
  const successMsgs = messages.filter(m => !m.content.startsWith("[失败]"));
  const failedMsgs = messages.filter(m => m.content.startsWith("[失败]"));

  const progressSection = successMsgs.map(m => {
    const name = ROLE_CN[m.role] || m.role;
    const lines = m.content.split("\n").filter(l => l.trim());
    const keyPoints = lines.slice(0, 5).map(l => `- ${l.trim()}`).join("\n");
    return `**${name}**：\n${keyPoints}`;
  }).join("\n\n");

  const problemSection = failedMsgs.length > 0
    ? failedMsgs.map(m => `- ${ROLE_CN[m.role] || m.role}：${m.content.replace("[失败] ", "")}`).join("\n")
    : "- 暂无";

  const planLines = successMsgs.flatMap(m => {
    const lines = m.content.split("\n").filter(l => l.trim());
    return lines.filter(l => /建议|计划|下一步|优化|改进|应该|需要|推荐/.test(l)).slice(0, 2);
  }).slice(0, 5);

  const planSection = planLines.length > 0
    ? planLines.map(l => `- ${l.trim()}`).join("\n")
    : "- 根据分析结果持续推进";

  return `## ✅ 今日进展

任务：${inputPrompt.substring(0, 200)}

${progressSection}

## ⚠️ 存在问题

${problemSection}

## 📌 下一步计划

${planSection}

---
📌 执行摘要：${summary}`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { productId, inputPrompt, withGitHub } = body;

  if (!productId) {
    return new Response(sseEvent("error", { message: "productId 不能为空" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  }

  const prompt = inputPrompt || "请对这个产品进行全面团队分析评估。";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: string, d: unknown) => controller.enqueue(encoder.encode(sseEvent(e, d)));

      try {
        if (withGitHub) {
          const result = await runPipelineWithGitHub(Number(productId), prompt, (evt) => send(evt.type, evt));
          const dailyContent = buildDailyReportContent(Number(productId), prompt, result.messages, result.run.summary || "");
          await execute("INSERT INTO daily_reports (product_id, content) VALUES (?, ?)", [Number(productId), dailyContent]);
          send("done", { run: result.run, messageCount: result.messages.length, github: result.github });
        } else {
          const { runPipelineWithProgress } = await import("@/lib/agents/pipeline");
          const result = await runPipelineWithProgress(Number(productId), prompt, "manual", (evt) => send(evt.type, evt));
          const dailyContent = buildDailyReportContent(Number(productId), prompt, result.messages, result.run.summary || "");
          await execute("INSERT INTO daily_reports (product_id, content) VALUES (?, ?)", [Number(productId), dailyContent]);
          send("done", { run: result.run, messageCount: result.messages.length });
        }
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "执行失败" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
