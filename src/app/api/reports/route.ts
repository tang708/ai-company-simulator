import { NextRequest, NextResponse } from "next/server";
import { query, execute } from "@/lib/db";
import { runPipeline } from "@/lib/agents/pipeline";
import { chatCompletion } from "@/lib/deepseek";
import type { Report } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product_id");
    const type = searchParams.get("type");

    let sql = "SELECT * FROM reports WHERE 1=1";
    const params: (string | number)[] = [];

    if (productId) {
      sql += " AND product_id = ?";
      params.push(Number(productId));
    }
    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    sql += " ORDER BY created_at DESC LIMIT 50";

    const reports = await query<Report>(sql, params);
    return NextResponse.json({ success: true, data: reports });
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
    const { product_id, type, date } = body;

    if (!product_id || !type) {
      return NextResponse.json(
        { success: false, error: "product_id 和 type 不能为空" },
        { status: 400 }
      );
    }

    const product = await query<{ name: string; prd: string }>(
      "SELECT name, prd FROM products WHERE id = ?",
      [Number(product_id)]
    );
    if (!product || product.length === 0) {
      return NextResponse.json({ success: false, error: "产品不存在" }, { status: 404 });
    }

    if (type === "team_report") {
      const inputPrompt = `请对产品「${product[0].name}」进行全面团队分析评估。PRD：${product[0].prd || "无"}`;
      const pipelineResult = await runPipeline(Number(product_id), inputPrompt, "manual");

      const reportContent = pipelineResult.messages
        .map((m) => `## ${m.role} 的分析\n\n${m.content}`)
        .join("\n\n---\n\n");

      const reportTitle = `团队分析报告 - ${product[0].name}`;

      const scorePrompt = `基于以下AI团队分析，请给出一个1-100的团队综合评分，只返回数字：\n\n${pipelineResult.run.summary}`;
      const scoreStr = await chatCompletion("你是一个评分助手，只返回数字。", scorePrompt, { temperature: 0.3, maxTokens: 10 });
      const score = parseInt(scoreStr) || 70;

      const summaryPipeline = pipelineResult.run.summary || "";

      const result = await execute(
        "INSERT INTO reports (product_id, type, title, content, summary, score, pipeline_run_id, report_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          Number(product_id),
          type,
          reportTitle,
          reportContent,
          summaryPipeline,
          Math.min(100, Math.max(1, score)),
          pipelineResult.run.id,
          date || new Date().toISOString().split("T")[0],
        ]
      );

      const report = await query<Report>(
        "SELECT * FROM reports WHERE id = ?",
        [result.insertId]
      );

      return NextResponse.json({ success: true, data: report[0] }, { status: 201 });
    }

    if (type === "daily_report") {
      const todayPrompt = `请为产品「${product[0].name}」生成一份今日工作日报，包含：今日进展、遇到的问题、明日计划。`;
      const dailyContent = await chatCompletion(
        "你是一个专业的项目管理助手，请生成结构化的日报。",
        todayPrompt,
        { temperature: 0.5 }
      );

      const reportTitle = `工作日报 - ${product[0].name} - ${date || new Date().toISOString().split("T")[0]}`;

      const result = await execute(
        "INSERT INTO reports (product_id, type, title, content, report_date) VALUES (?, ?, ?, ?, ?)",
        [
          Number(product_id),
          type,
          reportTitle,
          dailyContent,
          date || new Date().toISOString().split("T")[0],
        ]
      );

      const report = await query<Report>(
        "SELECT * FROM reports WHERE id = ?",
        [result.insertId]
      );

      return NextResponse.json({ success: true, data: report[0] }, { status: 201 });
    }

    return NextResponse.json({ success: false, error: "不支持的报告类型" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "生成报告失败" },
      { status: 500 }
    );
  }
}
