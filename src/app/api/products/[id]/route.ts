import { NextRequest, NextResponse } from "next/server";
import { queryOne, query, execute } from "@/lib/db";
import type { Product } from "@/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const product = await queryOne<Product>(
      "SELECT * FROM products WHERE id = ?",
      [id]
    );
    if (!product) {
      return NextResponse.json({ success: false, error: "产品不存在" }, { status: 404 });
    }

    const teamMembers = await query(
      `SELECT tm.*, a.role, a.name as agent_name, a.skills
       FROM team_members tm
       JOIN agents a ON tm.agent_id = a.id
       WHERE tm.product_id = ?`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: { ...product, team_members: teamMembers },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "查询失败" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id);
    const body = await request.json();
    const { name, prd, repo_url, status } = body;

    const product = await queryOne<Product>(
      "SELECT * FROM products WHERE id = ?",
      [id]
    );
    if (!product) {
      return NextResponse.json({ success: false, error: "产品不存在" }, { status: 404 });
    }

    await execute(
      "UPDATE products SET name = ?, prd = ?, repo_url = ?, status = ? WHERE id = ?",
      [
        name || product.name,
        prd !== undefined ? (prd || null) : product.prd,
        repo_url !== undefined ? (repo_url || null) : product.repo_url,
        status || product.status,
        id,
      ]
    );

    const updated = await queryOne<Product>(
      "SELECT * FROM products WHERE id = ?",
      [id]
    );
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
    const id = parseInt(params.id);
    await execute("DELETE FROM products WHERE id = ?", [id]);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "删除失败" },
      { status: 500 }
    );
  }
}
