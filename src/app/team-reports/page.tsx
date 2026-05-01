"use client";

import { useEffect, useState } from "react";
import type { TeamReport } from "@/types";

const ROLE_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
  pm_output: { label: "产品经理 (PM)", emoji: "📊", color: "#6366f1" },
  tech_output: { label: "技术负责人 (TechLead)", emoji: "💻", color: "#3b82f6" },
  dev_output: { label: "开发工程师 (Dev)", emoji: "⚙️", color: "#f59e0b" },
  qa_output: { label: "测试工程师 (QA)", emoji: "🔍", color: "#22c55e" },
  ops_output: { label: "运维工程师 (Ops)", emoji: "🛡️", color: "#ef4444" },
  data_output: { label: "数据分析师 (Data)", emoji: "📈", color: "#8b5cf6" },
};

const ROLE_KEYS = ["pm_output", "tech_output", "dev_output", "qa_output", "ops_output", "data_output"];

export default function TeamReportsPage() {
  const [reports, setReports] = useState<TeamReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/team-reports");
        const json = await res.json();
        if (json.success) setReports(json.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  async function deleteReport(id: number) {
    if (!confirm("确定删除此团队报告？")) return;
    try {
      await fetch(`/api/team-reports/${id}`, { method: "DELETE" });
      setReports(reports.filter((r) => r.id !== id));
    } catch (err) { console.error(err); }
  }

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">📊 团队报告</h1>

      {reports.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}>
          暂无团队报告，前往 <a href="/" style={{ color: "var(--accent)" }}>控制台</a> 为产品运行 AI 团队
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {reports.map((report) => (
            <div key={report.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>📊</span>
                    <strong>产品 #{report.product_id} 团队分析报告</strong>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      {new Date(report.created_at).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  {report.summary && (
                    <div style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic" }}>
                      {report.summary}
                    </div>
                  )}
                </div>
                <button className="btn-secondary" onClick={() => deleteReport(report.id)} style={{ fontSize: 12, padding: "6px 12px", color: "var(--danger)" }}>
                  删除
                </button>
              </div>

              {expandedId === report.id && (
                <div style={{ marginTop: 12 }}>
                  {ROLE_KEYS.map((key) => {
                    const content = (report as unknown as Record<string, string | null>)[key];
                    if (!content) return null;
                    const info = ROLE_LABELS[key];
                    return (
                      <div key={key} className="message-bubble" style={{ borderLeft: `3px solid ${info.color}` }}>
                        <span className="role-tag" style={{ background: info.color, color: "#fff" }}>
                          {info.emoji} {info.label}
                        </span>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.7, margin: 0, color: "var(--text-primary)" }}>
                          {content}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
