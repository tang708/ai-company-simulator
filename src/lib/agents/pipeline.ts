import { queryOne, execute, query } from "@/lib/db";
import { invokeAgent } from "./engine";
import { fetchWebContent } from "@/lib/mcp/fetch";
import { chatCompletion } from "@/lib/deepseek";
import { recordAnalysis, buildMemoryContext } from "./memory";
import type { AgentRole, PipelineRun, PipelineMessage } from "@/types";

const PIPELINE_FLOW: AgentRole[] = ["PM", "TechLead", "Dev", "QA", "Ops", "Data"];

const ROLE_CN: Record<AgentRole, string> = {
  PM: "产品经理", TechLead: "技术负责人", Dev: "开发工程师",
  QA: "测试工程师", Ops: "运维工程师", Data: "数据分析师",
};

const ROLE_TASKS: Record<AgentRole, string> = {
  PM: "从商业价值和用户需求角度，给出3-5条核心建议。",
  TechLead: "评估技术可行性，给出3-5条架构建议。",
  Dev: "给出3-5条具体实现方案和工时估算。",
  QA: "列出3-5条关键测试点和质量风险。",
  Ops: "给出3-5条部署和监控建议。",
  Data: "给出3-5条核心指标和增长建议。",
};

async function getAgentId(role: string): Promise<number> {
  const row = await queryOne<{ id: number }>("SELECT id FROM agents WHERE role = ?", [role]);
  if (!row) throw new Error(`Agent ${role} 不存在`);
  return row.id;
}

export type PipelineProgressCallback = (event: {
  type: "role_start" | "role_done" | "role_error" | "summary" | "complete";
  role?: AgentRole;
  roleIndex?: number;
  totalRoles?: number;
  progress?: number;
  content?: string;
  structured?: Record<string, unknown> | null;
  error?: string;
  summary?: string;
  run?: PipelineRun;
}) => void;

async function extractUrls(text: string): Promise<string[]> {
  return text.match(/https?:\/\/[^\s]+/g) || [];
}

export async function runPipelineWithProgress(
  productId: number,
  inputPrompt: string,
  triggerType: "manual" | "daily" | "event" = "manual",
  onProgress?: PipelineProgressCallback
): Promise<{ run: PipelineRun; messages: PipelineMessage[] }> {
  const product = await queryOne<{ name: string; prd: string; status: string; repo_url: string }>(
    "SELECT name, prd, status, repo_url FROM products WHERE id = ?", [productId]
  );
  if (!product) throw new Error(`产品 ${productId} 不存在`);

  let externalSummary = "";
  const urls = await extractUrls(inputPrompt);
  if (urls.length > 0) {
    const contents: string[] = [];
    for (const url of urls.slice(0, 3)) {
      try {
        const c = await fetchWebContent(url);
        if (c && !c.startsWith("获取网页")) contents.push(c.substring(0, 2000));
      } catch { /* ignore */ }
    }
    if (contents.length > 0) externalSummary = contents.join("\n\n---\n\n");
  }

  const insertResult = await execute(
    "INSERT INTO pipeline_runs (product_id, trigger_type, input_prompt, status, progress, current_role) VALUES (?, ?, ?, 'running', 0, 'PM')",
    [productId, triggerType, inputPrompt]
  );
  const runId = insertResult.insertId;

  const memoryCtx = await buildMemoryContext(productId);
  let productContext = `## 产品信息\n- 名称: ${product.name}\n- PRD: ${product.prd || "无"}\n- 仓库: ${product.repo_url || "无"}\n- 状态: ${product.status}`;
  if (memoryCtx) productContext += `\n\n## 历史上下文\n${memoryCtx}`;
  if (externalSummary) productContext += `\n\n## MCP Fetch 外部数据\n${externalSummary}`;

  const messages: PipelineMessage[] = [];
  const total = PIPELINE_FLOW.length;

  onProgress?.({ type: "role_start", role: "PM", roleIndex: 0, totalRoles: total, progress: 5 });

  let pmContent = "";
  let pmStructured: Record<string, unknown> | null = null;

  try {
    const result = await invokeAgent("PM", `${productContext}\n\n## 分析任务\n${inputPrompt}`, `作为产品经理，${ROLE_TASKS.PM}`);
    pmContent = result.content;
    pmStructured = result.structured;

    const pmAgentId = await getAgentId("PM");
    const msgRes = await execute(
      "INSERT INTO pipeline_messages (pipeline_run_id, agent_id, role, content, structured_output, sequence) VALUES (?, ?, ?, ?, ?, 1)",
      [runId, pmAgentId, "PM", pmContent, pmStructured ? JSON.stringify(pmStructured) : null]
    );

    messages.push({
      id: msgRes.insertId, pipeline_run_id: runId, agent_id: pmAgentId, role: "PM",
      content: pmContent, structured_output: pmStructured ? JSON.stringify(pmStructured) : null,
      sequence: 1, created_at: new Date().toISOString(),
    });

    await execute("UPDATE pipeline_runs SET progress = 20, current_role = 'PM' WHERE id = ?", [runId]);
    onProgress?.({ type: "role_done", role: "PM", roleIndex: 0, totalRoles: total, progress: 20, content: pmContent, structured: pmStructured });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "未知错误";
    const pmAgentId = await getAgentId("PM");
    await execute(
      "INSERT INTO pipeline_messages (pipeline_run_id, agent_id, role, content, sequence) VALUES (?, ?, ?, ?, 1)",
      [runId, pmAgentId, "PM", `[失败] ${errMsg}`]
    );
    await execute("UPDATE pipeline_runs SET progress = 20, current_role = 'PM' WHERE id = ?", [runId]);
    onProgress?.({ type: "role_error", role: "PM", roleIndex: 0, totalRoles: total, progress: 20, error: errMsg });
  }

  const remainingRoles = PIPELINE_FLOW.slice(1);
  const parallelContext = `## 产品经理分析\n${pmContent.substring(0, 1500)}\n\n## 原始任务\n${inputPrompt}`;

  const agentIdCache: Record<string, number> = {};
  for (const role of remainingRoles) {
    agentIdCache[role] = await getAgentId(role);
  }

  const parallelResults = await Promise.allSettled(
    remainingRoles.map(async (role, idx) => {
      const seq = idx + 2;
      const realIdx = idx + 1;
      const progress = 20 + Math.round((realIdx / total) * 70);

      await execute("UPDATE pipeline_runs SET progress = ?, current_role = ? WHERE id = ?", [progress, role, runId]);
      onProgress?.({ type: "role_start", role, roleIndex: realIdx, totalRoles: total, progress });

      try {
        const ctx = `${parallelContext}\n\n> 请从「${ROLE_CN[role]}」专业角度补充分析。`;
        const task = `作为${ROLE_CN[role]}，${ROLE_TASKS[role]}`;
        const { content, structured } = await invokeAgent(role, ctx, task);

        const agentId = agentIdCache[role];
        const msgRes = await execute(
          "INSERT INTO pipeline_messages (pipeline_run_id, agent_id, role, content, structured_output, sequence) VALUES (?, ?, ?, ?, ?, ?)",
          [runId, agentId, role, content, structured ? JSON.stringify(structured) : null, seq]
        );

        onProgress?.({ type: "role_done", role, roleIndex: realIdx, totalRoles: total, progress: progress + Math.round(70 / total), content, structured });

        return {
          id: msgRes.insertId, pipeline_run_id: runId, agent_id: agentId, role,
          content, structured_output: structured ? JSON.stringify(structured) : null,
          sequence: seq, created_at: new Date().toISOString(),
          success: true,
        };
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "未知错误";
        const agentId = agentIdCache[role];
        const msgRes = await execute(
          "INSERT INTO pipeline_messages (pipeline_run_id, agent_id, role, content, sequence) VALUES (?, ?, ?, ?, ?)",
          [runId, agentId, role, `[失败] ${errMsg}`, seq]
        );
        onProgress?.({ type: "role_error", role, roleIndex: realIdx, totalRoles: total, progress, error: errMsg });
        return {
          id: msgRes.insertId, pipeline_run_id: runId, agent_id: agentId, role,
          content: `[失败] ${errMsg}`, structured_output: null,
          sequence: seq, created_at: new Date().toISOString(),
          success: false,
        };
      }
    })
  );

  for (const r of parallelResults) {
    if (r.status === "fulfilled") messages.push(r.value as PipelineMessage);
  }

  for (const m of messages) {
    if (!m.content.startsWith("[失败]")) {
      recordAnalysis(productId, m.role, m.content.substring(0, 300)).catch(() => {});
    }
  }

  await execute("UPDATE pipeline_runs SET progress = 95, current_role = 'summary' WHERE id = ?", [runId]);

  let summary: string;
  try {
    const successMsgs = messages.filter((m) => !m.content.startsWith("[失败]"));
    summary = await chatCompletion(
      "用中文总结关键发现（3-5句话），突出核心结论和行动建议。",
      `原始问题: ${inputPrompt}\n\n分析摘要:\n${successMsgs.map((m) => `[${m.role}] ${m.content.substring(0, 250)}`).join("\n")}`,
      { temperature: 0.4, maxTokens: 600 }
    );
  } catch {
    summary = `${messages.filter(m => !m.content.startsWith("[失败]")).length}/${total} 成功`;
  }

  onProgress?.({ type: "summary", progress: 95, summary });

  const failedCount = messages.filter(m => m.content.startsWith("[失败]")).length;
  const finalStatus = failedCount === 0 ? "completed" : (failedCount >= total ? "failed" : "completed");

  await execute(
    "UPDATE pipeline_runs SET status = ?, summary = ?, progress = 100, current_role = NULL, completed_at = NOW() WHERE id = ?",
    [finalStatus, summary, runId]
  );

  const run = await queryOne<PipelineRun>("SELECT * FROM pipeline_runs WHERE id = ?", [runId]);

  onProgress?.({ type: "complete", progress: 100, run: run!, summary });

  return { run: run!, messages };
}

export async function runPipeline(
  productId: number, inputPrompt: string, triggerType?: "manual" | "daily" | "event"
) {
  return runPipelineWithProgress(productId, inputPrompt, triggerType);
}

export async function getPipelineStatus(runId: number) {
  const run = await queryOne<PipelineRun>("SELECT * FROM pipeline_runs WHERE id = ?", [runId]);
  if (!run) return null;
  const msgs = await query<PipelineMessage>(
    "SELECT * FROM pipeline_messages WHERE pipeline_run_id = ? ORDER BY sequence", [runId]
  );
  return { run, messages: msgs || [] };
}
