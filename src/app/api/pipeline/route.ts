import { NextRequest, NextResponse } from "next/server";
import { runPipeline, getPipelineStatus } from "@/lib/agents/pipeline";
import { query } from "@/lib/db";
import type { PipelineRun } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId");
    const productId = searchParams.get("productId");
    const status = searchParams.get("status");

    if (runId) {
      const result = await getPipelineStatus(Number(runId));
      if (!result) {
        return NextResponse.json({ success: false, error: "Pipeline 不存在" }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: result });
    }

    let sql = "SELECT * FROM pipeline_runs WHERE 1=1";
    const params: (string | number)[] = [];

    if (productId) { sql += " AND product_id = ?"; params.push(Number(productId)); }
    if (status) { sql += " AND status = ?"; params.push(status); }
    sql += " ORDER BY started_at DESC LIMIT 50";

    const runs = await query<PipelineRun>(sql, params);
    return NextResponse.json({ success: true, data: runs });
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
    const { productId, inputPrompt, triggerType } = body;

    if (!productId || !inputPrompt) {
      return NextResponse.json(
        { success: false, error: "productId 和 inputPrompt 不能为空" },
        { status: 400 }
      );
    }

    const result = await runPipeline(Number(productId), inputPrompt, triggerType || "manual");

    const successCount = result.messages.filter((m) => !m.content.startsWith("[失败]")).length;
    const failedCount = result.messages.length - successCount;

    return NextResponse.json({
      success: true,
      data: {
        run: result.run,
        messages: result.messages,
        stats: { total: result.messages.length, success: successCount, failed: failedCount },
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Pipeline 执行失败" },
      { status: 500 }
    );
  }
}
