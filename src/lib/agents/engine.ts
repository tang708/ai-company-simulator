import { queryOne } from "@/lib/db";
import { chatCompletion } from "@/lib/deepseek";
import type { Agent, AgentRole } from "@/types";

export async function getAgentByRole(role: AgentRole): Promise<Agent | null> {
  const raw = await queryOne<Record<string, unknown>>("SELECT * FROM agents WHERE role = ?", [role]);
  if (!raw) return null;
  return normalizeAgent(raw);
}

export async function getAllAgents(): Promise<Agent[]> {
  const { query } = await import("@/lib/db");
  const rows = await query<Record<string, unknown>>("SELECT * FROM agents ORDER BY FIELD(role, 'PM','TechLead','Dev','QA','Ops','Data')");
  return rows.map(normalizeAgent);
}

function normalizeAgent(raw: Record<string, unknown>): Agent {
  let skills: string[] = [];
  if (typeof raw.skills === "string") {
    try { skills = JSON.parse(raw.skills as string); } catch { /* ignore */ }
  } else if (Array.isArray(raw.skills)) {
    skills = raw.skills as string[];
  }

  let mcp_tools: string[] = [];
  if (typeof raw.mcp_tools === "string") {
    try { mcp_tools = JSON.parse(raw.mcp_tools as string); } catch { /* ignore */ }
  } else if (Array.isArray(raw.mcp_tools)) {
    mcp_tools = raw.mcp_tools as string[];
  }

  return {
    id: raw.id as number,
    role: raw.role as AgentRole,
    name: raw.name as string,
    system_prompt: raw.system_prompt as string,
    skills,
    mcp_tools,
    output_format: (raw.output_format as string) || "",
    model: (raw.model as string) || "deepseek-v4-pro",
    temperature: Number(raw.temperature) || 0.7,
    created_at: raw.created_at as string,
  };
}

export async function invokeAgent(
  role: AgentRole,
  context: string,
  task: string
): Promise<{ content: string; structured: Record<string, unknown> | null }> {
  const agent = await getAgentByRole(role);
  if (!agent) {
    throw new Error(`角色 ${role} 不存在`);
  }

  const skillsText = agent.skills.length > 0 ? agent.skills.join("、") : "";
  const mcpText = agent.mcp_tools.length > 0 ? `可用工具：${agent.mcp_tools.join("、")}` : "";

  let userMessage = `## 当前上下文\n${context}\n\n## 需要你处理的任务\n${task}`;

  let fullSystemPrompt = agent.system_prompt;
  if (skillsText) fullSystemPrompt += `\n\n核心技能：${skillsText}`;
  if (mcpText) fullSystemPrompt += `\n\n${mcpText}`;

  const result = await chatCompletion(fullSystemPrompt, userMessage, {
    temperature: agent.temperature,
    maxTokens: 2048,
  });

  const structured = tryParseJSON(result);

  return { content: result, structured };
}

function tryParseJSON(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
}
