import { NextRequest, NextResponse } from "next/server";
import { queryOne, execute } from "@/lib/db";
import type { Task } from "@/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const task = await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [parseInt(params.id)]);
    if (!task) {
      return NextResponse.json({ success: false, error: "任务不存在" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: task });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const id = parseInt(params.id);

    const task = await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [id]);
    if (!task) {
      return NextResponse.json({ success: false, error: "任务不存在" }, { status: 404 });
    }

    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.title !== undefined) { fields.push("title = ?"); values.push(body.title); }
    if (body.description !== undefined) { fields.push("description = ?"); values.push(body.description); }
    if (body.status !== undefined) { fields.push("status = ?"); values.push(body.status); }
    if (body.priority !== undefined) { fields.push("priority = ?"); values.push(body.priority); }
    if (body.assigned_role !== undefined) { fields.push("assigned_role = ?"); values.push(body.assigned_role); }

    if (fields.length === 0) {
      return NextResponse.json({ success: false, error: "无更新字段" }, { status: 400 });
    }

    values.push(id);
    await execute(`UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`, values);

    const updated = await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [id]);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "更新失败" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await execute("DELETE FROM tasks WHERE id = ?", [parseInt(params.id)]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 }
    );
  }
}
