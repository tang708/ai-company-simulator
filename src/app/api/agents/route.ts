import { NextResponse } from "next/server";
import { getAllAgents } from "@/lib/agents/engine";

export async function GET() {
  try {
    const agents = await getAllAgents();
    return NextResponse.json({ success: true, data: agents });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}
