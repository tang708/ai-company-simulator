"use client";

import { useEffect, useState } from "react";
import type { TeamReport, AgentRole } from "@/types";
import { ROLE_META } from "@/types";

const ROLE_KEYS: { key: keyof TeamReport; role: AgentRole }[] = [
  { key: "pm_output", role: "PM" },
  { key: "tech_output", role: "TechLead" },
  { key: "dev_output", role: "Dev" },
  { key: "qa_output", role: "QA" },
  { key: "ops_output", role: "Ops" },
  { key: "data_output", role: "Data" },
];

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
      setReports(reports.filter(r => r.id !== id));
    } catch (err) { console.error(err); }
  }

  function downloadWord(id: number) {
    window.open(`/api/export/word?type=team&id=${id}`, "_blank");
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}><div className="loading-spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>📋 团队报告</h1>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>手动触发的产品团队综合报告</span>
      </div>

      {reports.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">📋</div>
          <p style={{ marginBottom: 16 }}>暂无团队报告</p>
          <a href="/" style={{ color: "var(--accent)" }}>前往控制台运行团队 →</a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {reports.map(report => (
            <div key={report.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <strong style={{ fontSize: 14 }}>产品 #{report.product_id} 团队报告</strong>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(report.created_at).toLocaleString("zh-CN")}</span>
                  </div>
                  {report.summary && (
                    <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                      {report.summary.substring(0, 300)}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="btn-secondary btn-sm" onClick={() => downloadWord(report.id)}>📥 Word</button>
                  <button className="btn-danger" onClick={() => deleteReport(report.id)}>删除</button>
                </div>
              </div>

              {expandedId === report.id && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  {report.summary && (
                    <div style={{ background: "var(--bg-primary)", borderRadius: 8, padding: 14, borderLeft: "3px solid var(--accent)", marginBottom: 16, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                      {report.summary}
                    </div>
                  )}
                  {ROLE_KEYS.map(({ key, role }) => {
                    const content = report[key] as string | null;
                    if (!content) return null;
                    const meta = ROLE_META[role];
                    return (
                      <div key={key} className="message-bubble" style={{ borderLeft: `3px solid ${meta.color}` }}>
                        <span className="role-tag" style={{ background: meta.color }}>{meta.emoji} {meta.name}</span>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, lineHeight: 1.7, margin: 0, color: "var(--text-primary)" }}>{content}</pre>
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
