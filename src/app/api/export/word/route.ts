import { NextRequest, NextResponse } from "next/server";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } from "docx";
import { queryOne, query } from "@/lib/db";
import type { TeamReport, DailyReport, AgentRole } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE_CN: Record<string, string> = {
  PM: "产品经理", TechLead: "技术负责人", Dev: "开发工程师",
  QA: "测试工程师", Ops: "运维工程师", Data: "数据分析师",
};

function textParagraph(text: string, options?: { bold?: boolean; size?: number; color?: string }): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: options?.bold, size: options?.size || 22, color: options?.color })],
    spacing: { after: 120 },
  });
}

function headingParagraph(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: level === HeadingLevel.HEADING_1 ? 32 : 26 })],
    heading: level,
    spacing: { before: 240, after: 120 },
  });
}

function contentParagraphs(content: string): Paragraph[] {
  return content.split("\n").filter(l => l.trim()).map(line =>
    new Paragraph({
      children: [new TextRun({ text: line.trim(), size: 21 })],
      spacing: { after: 80 },
    })
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  const id = searchParams.get("id");

  if (!type || !id) {
    return NextResponse.json({ success: false, error: "需要 type 和 id 参数" }, { status: 400 });
  }

  try {
    let doc: Document;

    if (type === "team") {
      const report = await queryOne<TeamReport>("SELECT * FROM team_reports WHERE id = ?", [Number(id)]);
      if (!report) return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });

      const product = await queryOne<{ name: string }>("SELECT name FROM products WHERE id = ?", [report.product_id]);

      const roleOutputs: [string, string | null][] = [
        ["PM", report.pm_output],
        ["TechLead", report.tech_output],
        ["Dev", report.dev_output],
        ["QA", report.qa_output],
        ["Ops", report.ops_output],
        ["Data", report.data_output],
      ];

      const sections = roleOutputs
        .filter(([_, content]) => content)
        .flatMap(([role, content]) => [
          headingParagraph(`${ROLE_CN[role]} (${role})`, HeadingLevel.HEADING_2),
          ...contentParagraphs(content!),
        ]);

      doc = new Document({
        sections: [{
          children: [
            headingParagraph(`团队分析报告 - ${product?.name || "未知产品"}`, HeadingLevel.HEADING_1),
            textParagraph(`生成时间：${new Date(report.created_at).toLocaleString("zh-CN")}`, { size: 18, color: "666666" }),
            new Paragraph({ children: [], spacing: { after: 200 } }),
            headingParagraph("执行摘要", HeadingLevel.HEADING_2),
            ...contentParagraphs(report.summary || "暂无摘要"),
            new Paragraph({ children: [], spacing: { after: 200 } }),
            ...sections,
          ],
        }],
      });
    } else if (type === "daily") {
      const report = await queryOne<DailyReport>("SELECT * FROM daily_reports WHERE id = ?", [Number(id)]);
      if (!report) return NextResponse.json({ success: false, error: "报告不存在" }, { status: 404 });

      const product = await queryOne<{ name: string }>("SELECT name FROM products WHERE id = ?", [report.product_id]);

      doc = new Document({
        sections: [{
          children: [
            headingParagraph(`工作日报 - ${product?.name || "未知产品"}`, HeadingLevel.HEADING_1),
            textParagraph(`生成时间：${new Date(report.created_at).toLocaleString("zh-CN")}`, { size: 18, color: "666666" }),
            new Paragraph({ children: [], spacing: { after: 200 } }),
            ...contentParagraphs(report.content),
          ],
        }],
      });
    } else {
      return NextResponse.json({ success: false, error: "type 必须为 team 或 daily" }, { status: 400 });
    }

    const buffer = await Packer.toBuffer(doc);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${type}-report-${id}.docx"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "导出失败" },
      { status: 500 }
    );
  }
}
