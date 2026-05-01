import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, execute } from "@/lib/db";
import { chatCompletion } from "@/lib/deepseek";
import { buildMemoryContext } from "@/lib/agents/memory";
import type { DailyReport, TeamReport } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const productId = searchParams.get("product_id");

    let sql = "SELECT * FROM daily_reports";
    const params: (string | number)[] = [];
    if (productId) { sql += " WHERE product_id = ?"; params.push(Number(productId)); }
    sql += " ORDER BY created_at DESC LIMIT 50";

    const reports = await query<DailyReport>(sql, params);
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
    const { product_id } = body;

    if (!product_id) {
      return NextResponse.json({ success: false, error: "product_id 不能为空" }, { status: 400 });
    }

    const [product, latestTeam, memoryCtx, tasks, completedTasks] = await Promise.all([
      queryOne<{ name: string; prd: string; status: string }>(
        "SELECT name, prd, status FROM products WHERE id = ?", [Number(product_id)]
      ),
      queryOne<TeamReport>(
        "SELECT * FROM team_reports WHERE product_id = ? ORDER BY created_at DESC LIMIT 1", [Number(product_id)]
      ),
      buildMemoryContext(Number(product_id)),
      query<{ title: string; status: string; priority: string; assigned_role: string }>(
        "SELECT title, status, priority, assigned_role FROM tasks WHERE product_id = ? ORDER BY updated_at DESC LIMIT 20", [Number(product_id)]
      ),
      query<{ title: string }>(
        "SELECT title FROM tasks WHERE product_id = ? AND status = 'done' ORDER BY updated_at DESC LIMIT 5", [Number(product_id)]
      ),
    ]);

    if (!product) {
      return NextResponse.json({ success: false, error: "产品不存在" }, { status: 404 });
    }

    const todoList = tasks.filter(t => t.status === "todo" || t.status === "in_progress");
    const blockedList = tasks.filter(t => t.status === "review");
    const progressList = completedTasks;
    const problemList = tasks.filter(t => t.status !== "done" && t.priority === "high" || t.priority === "critical");

    const dailyPrompt = `你是专业的项目经理，请基于以下信息生成一份结构化工作日报。

## 产品信息
- 名称：${product.name}
- 状态：${product.status}
- PRD：${product.prd || "无"}

## 最新团队分析
${latestTeam?.summary?.substring(0, 1000) || "暂无"}

## 当前任务状态
- 待办/进行中 (${todoList.length}项)：${todoList.map(t => t.title).join("；") || "无"}
- 审查中 (${blockedList.length}项)：${blockedList.map(t => t.title).join("；") || "无"}
- 已完成 (${progressList.length}项)：${progressList.map(t => t.title).join("；") || "无"}

## 历史上下文
${memoryCtx}

请生成一份日报，必须严格按照以下三栏格式输出：

## ✅ 今日进展
（基于已完成任务和团队分析，总结今天的主要进展和成果）

## ⚠️ 存在问题
（基于阻塞任务和高优未完成项，列出当前面临的风险和障碍）

## 📌 下一步计划
（基于待办任务，给出明天需要推进的关键事项和优先级）`;

    const content = await chatCompletion(
      "你是专业的项目管理助手，请基于真实任务数据生成结构化日报。格式严格：三栏标题用 ## ✅ 今日进展 / ## ⚠️ 存在问题 / ## 📌 下一步计划",
      dailyPrompt,
      { temperature: 0.4, maxTokens: 3000 }
    );

    const result = await execute(
      "INSERT INTO daily_reports (product_id, content) VALUES (?, ?)",
      [Number(product_id), content]
    );

    const report = await queryOne<DailyReport>(
      "SELECT * FROM daily_reports WHERE id = ?", [result.insertId]
    );

    return NextResponse.json({ success: true, data: report }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "生成日报失败" },
      { status: 500 }
    );
  }
}
