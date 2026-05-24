import { NextRequest, NextResponse } from "next/server";
import { execute } from "@/lib/db";

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    if (body.github_uploaded !== undefined) {
      await execute("UPDATE team_reports SET github_uploaded = ? WHERE id = ?", [body.github_uploaded, id]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "更新失败" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await execute("DELETE FROM team_reports WHERE id = ?", [parseInt(params.id)]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "删除失败" }, { status: 500 });
  }
}
