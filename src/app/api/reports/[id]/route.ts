import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "@/lib/db";
import type { Report } from "@/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const report = await queryOne<Report>("SELECT * FROM reports WHERE id = ?", [parseInt(params.id)]);
    if (!report) {
      return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: report });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await execute("DELETE FROM reports WHERE id = ?", [parseInt(params.id)]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 }
    );
  }
}
