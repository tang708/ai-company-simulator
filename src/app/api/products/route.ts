import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import type { Product } from "@/types";

export async function GET() {
  try {
    const products = await query<Product>(
      "SELECT * FROM products ORDER BY created_at DESC"
    );
    return NextResponse.json({ success: true, data: products });
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
    const { name, prd, repo_url } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "产品名称不能为空" },
        { status: 400 }
      );
    }

    const result = await execute(
      "INSERT INTO products (name, prd, repo_url) VALUES (?, ?, ?)",
      [name.trim(), prd || null, repo_url || null]
    );

    const product = await queryOne<Product>(
      "SELECT * FROM products WHERE id = ?",
      [result.insertId]
    );

    // 自动组建6角色AI团队
    const agents = await query<{ id: number }>("SELECT id FROM agents");
    for (const agent of agents) {
      await execute(
        "INSERT INTO team_members (product_id, agent_id) VALUES (?, ?)",
        [result.insertId, agent.id]
      );
    }

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "创建失败" },
      { status: 500 }
    );
  }
}
