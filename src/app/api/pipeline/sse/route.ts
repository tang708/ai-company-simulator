import { NextRequest } from "next/server";
import { runPipelineWithGitHub } from "@/lib/agents/pipeline-github";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

  const prompt = inputPrompt || "请对这个产品进行全面团队分析评估，每个角色给出结构化分析。";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: string, d: unknown) => controller.enqueue(encoder.encode(sseEvent(e, d)));

      try {
        if (withGitHub) {
          const result = await runPipelineWithGitHub(Number(productId), prompt, (evt) => send(evt.type, evt));
          send("done", {
            run: result.run,
            messageCount: result.messages.length,
            github: result.github,
          });
        } else {
          const { runPipelineWithProgress } = await import("@/lib/agents/pipeline");
          const result = await runPipelineWithProgress(Number(productId), prompt, "manual", (evt) => send(evt.type, evt));
          send("done", {
            run: result.run,
            messageCount: result.messages.length,
          });
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
