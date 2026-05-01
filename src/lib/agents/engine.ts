import { queryOne } from "@/lib/db";
import { chatCompletion, chatCompletionWithHistory } from "@/lib/deepseek";
import type { Agent, AgentRole } from "@/types";

export async function getAgentByRole(role: AgentRole): Promise<Agent | null> {
  const raw = await queryOne<Record<string, unknown>>("SELECT * FROM agents WHERE role = ?", [role]);
  if (!raw) return null;
  return normalizeAgent(raw);
}

function normalizeAgent(raw: Record<string, unknown>): Agent {
  let skills: string[] = [];
  if (typeof raw.skills === "string") {
    try { skills = JSON.parse(raw.skills as string); } catch { /* ignore */ }
  } else if (Array.isArray(raw.skills)) {
    skills = raw.skills as string[];
  }
  return {
    id: raw.id as number,
    role: raw.role as AgentRole,
    name: raw.name as string,
    system_prompt: raw.system_prompt as string,
    skills,
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

  const skillsText = Array.isArray(agent.skills)
    ? agent.skills.join("、")
    : "";

  let userMessage = `## 当前上下文\n${context}\n\n## 需要你处理的任务\n${task}`;

  if (agent.output_format) {
    userMessage += `\n\n## 输出格式要求\n${agent.output_format}`;
  }

  let fullSystemPrompt = agent.system_prompt;
  if (skillsText) {
    fullSystemPrompt += `\n\n核心技能：${skillsText}`;
  }

  const result = await chatCompletion(fullSystemPrompt, userMessage, {
    temperature: agent.temperature,
    maxTokens: 4096,
  });

  const structured = tryParseJSON(result);

  return { content: result, structured };
}

export async function invokeAgentWithHistory(
  role: AgentRole,
  history: { role: "system" | "user" | "assistant"; content: string }[]
): Promise<{ content: string; structured: Record<string, unknown> | null }> {
  const agent = await getAgentByRole(role);
  if (!agent) {
    throw new Error(`角色 ${role} 不存在`);
  }

  const messages = [
    { role: "system" as const, content: agent.system_prompt },
    ...history,
  ];

  const result = await chatCompletionWithHistory(messages, {
    temperature: agent.temperature,
    maxTokens: 4096,
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
