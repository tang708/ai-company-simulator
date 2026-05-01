import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { runPipeline } from "@/lib/agents/pipeline";
import { chatCompletion } from "@/lib/deepseek";
import { buildMemoryContext } from "@/lib/agents/memory";
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
      if (col) roleOutputs[col] = msg.content;
    }

    const enhancedSummary = await generateTeamSummary(Number(product_id), pipelineResult.run.summary || "", pipelineResult.messages.map(m => ({ role: m.role, content: m.content })));

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

async function generateTeamSummary(productId: number, pipelineSummary: string, messages: { role: string; content: string }[]): Promise<string> {
  try {
    const [product, tasks, prevReport, recentDailies] = await Promise.all([
      queryOne<{ name: string; status: string }>("SELECT name, status FROM products WHERE id = ?", [productId]),
      query<{ title: string; status: string }>(
        "SELECT title, status FROM tasks WHERE product_id = ? ORDER BY updated_at DESC LIMIT 10", [productId]
      ),
      queryOne<{ summary: string; created_at: string }>(
        "SELECT summary, created_at FROM team_reports WHERE product_id = ? ORDER BY created_at DESC LIMIT 1", [productId]
      ),
      query<{ content: string; created_at: string }>(
        "SELECT content, created_at FROM daily_reports WHERE product_id = ? ORDER BY created_at DESC LIMIT 3", [productId]
      ),
    ]);

    const statusLabel = product?.status === "idea" ? "构思中" : product?.status === "dev" ? "开发中" : "已上线";
    const taskSummary = tasks.length > 0
      ? tasks.map(t => `- ${t.status === "done" ? "✅" : "⏳"} ${t.title}`).join("\n")
      : "暂无任务";
    const recentWork = recentDailies.length > 0
      ? recentDailies.map(d => d.content.substring(0, 200)).join("\n---\n")
      : "暂无近期日报";

    return await chatCompletion(
      "你是项目经理，生成一份简洁的团队报告摘要。严格按以下格式：\n\n## 📊 产品近况\n（当前状态、关键进展2-3句）\n\n## 👥 团队成果\n（各角色核心贡献，每角色1句）\n\n## 💡 优化建议\n（3-5条可操作的改进建议）",
      `产品：${product?.name || "未知"} (${statusLabel})\n\nPipeline摘要：${pipelineSummary}\n\n任务进展：\n${taskSummary}\n\n近期日报：\n${recentWork}\n\n上次报告：${prevReport?.summary?.substring(0, 200) || "首次报告"}`,
      { temperature: 0.4, maxTokens: 1200 }
    );
  } catch {
    return pipelineSummary;
  }
}
