import { NextRequest, NextResponse } from "next/server";
import { createPR, triggerWorkflowDispatch } from "@/lib/github";

export async function POST(request: NextRequest) {
  try {
    const { owner, repo, title, head, base, body, action } = await request.json();

    if (action === "dispatch") {
      if (!owner || !repo) return NextResponse.json({ success: false, error: "缺少参数" }, { status: 400 });
      await triggerWorkflowDispatch(owner, repo, "ci.yml", head || "main");
      return NextResponse.json({ success: true, data: { triggered: true } });
    }

    if (!owner || !repo || !title || !head) {
      return NextResponse.json({ success: false, error: "缺少参数 owner/repo/title/head" }, { status: 400 });
    }
    const data = await createPR(owner, repo, title, head, base || "main", body || "");
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "" }, { status: 500 });
  }
}
