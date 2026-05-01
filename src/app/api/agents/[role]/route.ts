import { NextRequest, NextResponse } from "next/server";
import { invokeAgent } from "@/lib/agents/engine";
import type { AgentRole } from "@/types";

export async function POST(
  request: NextRequest,
  { params }: { params: { role: string } }
) {
  try {
    const role = params.role as AgentRole;
    const body = await request.json();
    const { context, task } = body;

    if (!context || !task) {
      return NextResponse.json(
        { success: false, error: "context 和 task 参数不能为空" },
        { status: 400 }
      );
    }

    const result = await invokeAgent(role, context, task);
    return NextResponse.json({
      success: true,
      data: { role, content: result.content, structured: result.structured },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "调用失败" },
      { status: 500 }
    );
  }
}
