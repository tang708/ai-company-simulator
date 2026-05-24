import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import type { TeamReport, DailyReport } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE_CN: Record<string, string> = {
  PM: "产品经理", TechLead: "技术负责人", Dev: "开发工程师",
  QA: "测试工程师", Ops: "运维工程师", Data: "数据分析师",
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function textToHtml(content: string): string {
  return content.split("\n").map(line => {
    const escaped = escapeHtml(line);
    if (escaped.startsWith("## ")) return `<h2 style="color:#1a1a2e;margin:16px 0 8px">${escaped.slice(3)}</h2>`;
    if (escaped.startsWith("### ")) return `<h3 style="color:#333;margin:12px 0 6px">${escaped.slice(4)}</h3>`;
    if (escaped.startsWith("- ") || escaped.startsWith("* ")) return `<li style="margin:4px 0">${escaped.slice(2)}</li>`;
    if (escaped.startsWith("✅") || escaped.startsWith("⚠️") || escaped.startsWith("📌") || escaped.startsWith("💡") || escaped.startsWith("📊") || escaped.startsWith("👥")) return `<h3 style="color:#1a1a2e;margin:12px 0 6px">${escaped}</h3>`;
    return `<p style="margin:4px 0;line-height:1.8">${escaped || "&nbsp;"}</p>`;
  }).join("\n");
}

function wrapDoc(title: string, body: string): string {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 12pt; color: #333; line-height: 1.8; padding: 20px; }
  h1 { font-size: 18pt; color: #1a1a2e; border-bottom: 2px solid #6366f1; padding-bottom: 8px; }
  h2 { font-size: 14pt; }
  h3 { font-size: 12pt; }
  .meta { color: #888; font-size: 10pt; margin-bottom: 20px; }
  .section { margin: 16px 0; padding: 12px; border-left: 3px solid #6366f1; background: #f8f9fa; }
  .role-header { display: inline-block; padding: 4px 12px; background: #6366f1; color: white; border-radius: 4px; font-weight: bold; margin-bottom: 8px; }
</style></head>
<body>${body}</body></html>`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (!type || !id) {
    return NextResponse.json({ success: false, error: "需要 type 和 id 参数" }, { status: 400 });
  }

  try {
    let html: string;

    if (type === "team") {
      const report = await queryOne<TeamReport>("SELECT * FROM team_reports WHERE id = ?", [Number(id)]);
      if (!report) return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });

      const product = await queryOne<{ name: string }>("SELECT name FROM products WHERE id = ?", [report.product_id]);
      const productName = product?.name || "未知产品";

      const roleOutputs: [string, string | null][] = [
        ["PM", report.pm_output], ["TechLead", report.tech_output], ["Dev", report.dev_output],
        ["QA", report.qa_output], ["Ops", report.ops_output], ["Data", report.data_output],
      ];

      const roleSections = roleOutputs
        .filter(([_, content]) => content)
        .map(([role, content]) => `
          <div class="section">
            <div class="role-header">${ROLE_CN[role]} (${role})</div>
            ${textToHtml(content!)}
          </div>`)
        .join("\n");

      html = wrapDoc(`团队分析报告 - ${productName}`, `
        <h1>团队分析报告 - ${escapeHtml(productName)}</h1>
        <div class="meta">生成时间：${new Date(report.created_at).toLocaleString("zh-CN")}</div>
        <div class="section">
          <h2>执行摘要</h2>
          ${textToHtml(report.summary || "暂无摘要")}
        </div>
        ${roleSections}
      `);
    } else if (type === "daily") {
      const report = await queryOne<DailyReport>("SELECT * FROM daily_reports WHERE id = ?", [Number(id)]);
      if (!report) return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });

      const product = await queryOne<{ name: string }>("SELECT name FROM products WHERE id = ?", [report.product_id]);
      const productName = product?.name || "未知产品";

      html = wrapDoc(`工作日报 - ${productName}`, `
        <h1>工作日报 - ${escapeHtml(productName)}</h1>
        <div class="meta">生成时间：${new Date(report.created_at).toLocaleString("zh-CN")}</div>
        ${textToHtml(report.content)}
      `);
    } else {
      return NextResponse.json({ success: false, error: "type 必须为 team 或 daily" }, { status: 400 });
    }

    return new Response(html, {
      headers: {
        "Content-Type": "application/msword;charset=utf-8",
        "Content-Disposition": `attachment; filename="${type}-report-${id}.doc"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "导出失败" },
      { status: 500 }
    );
  }
}
