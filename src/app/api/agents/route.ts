import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { Agent, AgentRole } from "@/types";

export async function GET() {
  try {
    const rawAgents = await query<Record<string, unknown>>("SELECT * FROM agents ORDER BY id");

    const agents: Agent[] = rawAgents.map((raw) => {
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
    });

    return NextResponse.json({ success: true, data: agents });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}
