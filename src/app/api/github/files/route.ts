import { NextRequest, NextResponse } from "next/server";
import { listRepoContents, getFileContents, createOrUpdateFile } from "@/lib/github";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    const path = searchParams.get("path");
    const file = searchParams.get("file");

    if (file && owner && repo) {
      const data = await getFileContents(owner, repo, file);
      return NextResponse.json({ success: true, data });
    }

    if (owner && repo) {
      const data = await listRepoContents(owner, repo, path || "");
      return NextResponse.json({ success: true, data });
    }

    return NextResponse.json({ success: false, error: "需要 owner+repo" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { owner, repo, filePath, content, message, branch } = body;

    if (!owner || !repo || !filePath || !content) {
      return NextResponse.json({ success: false, error: "缺少参数" }, { status: 400 });
    }

    const result = await createOrUpdateFile(owner, repo, filePath, content, message || "Update file", branch || "main");

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "" }, { status: 500 });
  }
}
