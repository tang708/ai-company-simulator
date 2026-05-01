import { NextRequest, NextResponse } from "next/server";
import { listBranches, createBranch } from "@/lib/github";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner");
    const repo = searchParams.get("repo");
    if (!owner || !repo) return NextResponse.json({ success: false, error: "需要 owner+repo" }, { status: 400 });
    const data = await listBranches(owner, repo);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { owner, repo, branchName, fromBranch } = await request.json();
    if (!owner || !repo || !branchName) return NextResponse.json({ success: false, error: "缺少参数" }, { status: 400 });
    const data = await createBranch(owner, repo, branchName, fromBranch || "main");
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "" }, { status: 500 });
  }
}
