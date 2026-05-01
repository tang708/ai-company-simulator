import { NextRequest, NextResponse } from "next/server";
import { createRepo, listUserRepos, getRepo } from "@/lib/github";
import { execute, queryOne } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const list = searchParams.get("list");

    if (list === "user") {
      const repos = await listUserRepos();
      return NextResponse.json({ success: true, data: repos });
    }

    if (owner && repo) {
      const data = await getRepo(owner, repo);
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ success: false, error: "需要 owner+repo 或 list=user" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { productId, name, description, isPrivate } = body;

    if (!name) return NextResponse.json({ success: false, error: "仓库名称不能为空" }, { status: 400 });

    const repoData = await createRepo(name, description || "", isPrivate || false);

    if (productId) {
      const url = repoData.html_url;
      await execute("UPDATE products SET repo_url = ? WHERE id = ?", [url, Number(productId)]);
    }

    return NextResponse.json({ success: true, data: repoData }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "" }, { status: 500 });
  }
}
