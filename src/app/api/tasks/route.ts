import { NextRequest, NextResponse } from "next/server";
import { query, execute, queryOne } from "@/lib/db";
import type { Task } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product_id");

    let sql = "SELECT * FROM tasks WHERE 1=1";
    const params: (string | number)[] = [];

    if (productId) {
      sql += " AND product_id = ?";
      params.push(Number(productId));
    }

    sql += " ORDER BY created_at DESC LIMIT 100";

    const tasks = await query<Task>(sql, params);
    return NextResponse.json({ success: true, data: tasks });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, title, description, priority, assigned_role } = body;

    if (!product_id || !title) {
      return NextResponse.json(
        { success: false, error: "product_id 和 title 不能为空" },
        { status: 400 }
      );
    }

    const result = await execute(
      "INSERT INTO tasks (product_id, title, description, priority, assigned_role) VALUES (?, ?, ?, ?, ?)",
      [Number(product_id), title, description || null, priority || "medium", assigned_role || null]
    );

    const task = await queryOne<Task>("SELECT * FROM tasks WHERE id = ?", [result.insertId]);

    return NextResponse.json({ success: true, data: task }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "创建失败" },
      { status: 500 }
    );
  }
}
