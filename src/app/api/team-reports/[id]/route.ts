import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await execute("DELETE FROM team_reports WHERE id = ?", [parseInt(params.id)]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "删除失败" }, { status: 500 });
  }
}
