import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { runPipeline } from "@/lib/agents/pipeline";
import { chatCompletion } from "@/lib/deepseek";
import { buildMemoryContext, recordAnalysis } from "@/lib/agents/memory";
import type { TeamReport } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product_id");

    let sql = "SELECT * FROM team_reports";
    const params: (string | number)[] = [];

    if (productId) { sql += " WHERE product_id = ?"; params.push(Number(productId)); }
    sql += " ORDER BY created_at DESC LIMIT 50";

    const reports = await query<TeamReport>(sql, params);
    return NextResponse.json({ success: true, data: reports });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "查询失败" }, { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { product_id, input_prompt } = body;

    if (!product_id) {
      return NextResponse.json({ success: false, error: "product_id 不能为空" }, { status: 400 });
    }

    const memoryCtx = await buildMemoryContext(Number(product_id));
    const prompt = input_prompt
      ? `历史上下文:\n${memoryCtx}\n\n新任务: ${input_prompt}`
      : `请对这个产品进行全面团队分析评估。\n${memoryCtx}`;

    const pipelineResult = await runPipeline(Number(product_id), prompt, "manual");

    const roleOutputs: Record<string, string> = {};
    const roleMap: Record<string, string> = {
      PM: "pm_output", TechLead: "tech_output", Dev: "dev_output",
      QA: "qa_output", Ops: "ops_output", Data: "data_output",
    };

    for (const msg of pipelineResult.messages) {
      const col = roleMap[msg.role];
      if (col) {
        roleOutputs[col] = msg.content;
        if (!msg.content.startsWith("[失败]")) {
          recordAnalysis(Number(product_id), msg.role, msg.content.substring(0, 500)).catch(() => {});
        }
      }
    }

    // 生成增强摘要：进度+变动+建议
    const enhancedSummary = await generateEnhancedSummary(Number(product_id), pipelineResult.run.summary || "");

    const result = await execute(
      `INSERT INTO team_reports (product_id, pm_output, tech_output, dev_output, qa_output, ops_output, data_output, summary, pipeline_run_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        Number(product_id),
        roleOutputs.pm_output || null, roleOutputs.tech_output || null, roleOutputs.dev_output || null,
        roleOutputs.qa_output || null, roleOutputs.ops_output || null, roleOutputs.data_output || null,
        enhancedSummary, pipelineResult.run.id,
      ]
    );

    const report = await queryOne<TeamReport>(
      "SELECT * FROM team_reports WHERE id = ?", [result.insertId]
    );

    return NextResponse.json({
      success: true,
      data: { report, pipeline: pipelineResult },
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "生成团队报告失败" },
      { status: 500 }
    );
  }
}

async function generateEnhancedSummary(productId: number, pipelineSummary: string): Promise<string> {
  try {
    const [product, tasks, prevReport] = await Promise.all([
      queryOne<{ name: string; status: string }>("SELECT name, status FROM products WHERE id = ?", [productId]),
      query<{ title: string; status: string; updated_at: string }>(
        "SELECT title, status, updated_at FROM tasks WHERE product_id = ? ORDER BY updated_at DESC LIMIT 10", [productId]
      ),
      queryOne<{ summary: string }>(
        "SELECT summary FROM team_reports WHERE product_id = ? AND id < (SELECT MAX(id) FROM team_reports WHERE product_id = ?) ORDER BY id DESC LIMIT 1",
        [productId, productId]
      ),
    ]);

    const taskSummary = tasks.length > 0
      ? tasks.map(t => `- ${t.status === "done" ? "✅" : "⏳"} ${t.title}`).join("\n")
      : "暂无任务";
    const prevSummary = prevReport?.summary || "首次报告";
    const statusLabel = product?.status === "idea" ? "构思中" : product?.status === "dev" ? "开发中" : "已上线";

return `${pipelineSummary}

## 📊 产品进度总结
- 当前阶段：${statusLabel}
- 任务进展：\n${taskSummary}

## 📝 近期变动
上一份报告摘要：${prevSummary}

## 💡 优化建议
基于各角色分析，团队识别出以下优化方向，建议优先实施高优先级和高价值项目。
`;
  } catch {
    return pipelineSummary;
  }
}
