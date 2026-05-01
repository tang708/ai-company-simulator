"use client";

import { useEffect, useState } from "react";
import type { DailyReport } from "@/types";

export default function DailyReportsPage() {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/daily-reports");
        const json = await res.json();
        if (json.success) setReports(json.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  async function deleteReport(id: number) {
    if (!confirm("确定删除此日报？")) return;
    try {
      await fetch(`/api/daily-reports/${id}`, { method: "DELETE" });
      setReports(reports.filter(r => r.id !== id));
    } catch (err) { console.error(err); }
  }

  function downloadWord(id: number) {
    window.open(`/api/export/word?type=daily&id=${id}`, "_blank");
  }

  function parseDailyContent(content: string) {
    const progressMatch = content.match(/今日进展[：:]\s*([\s\S]*?)(?=存在问题|下一步计划|$)/i);
    const problemMatch = content.match(/存在的问题[：:]\s*([\s\S]*?)(?=下一步计划|$)/i);
    const planMatch = content.match(/下一步计划[：:]\s*([\s\S]*?)$/i);
    return {
      progress: progressMatch ? progressMatch[1].trim() : "",
      problems: problemMatch ? problemMatch[1].trim() : "",
      plan: planMatch ? planMatch[1].trim() : "",
    };
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}><div className="loading-spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>📝 工作日报</h1>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>团队执行完毕后自动生成</span>
      </div>

      {reports.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">📝</div>
          <p style={{ marginBottom: 16 }}>暂无日报</p>
          <a href="/" style={{ color: "var(--accent)" }}>前往控制台运行团队 →</a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map(report => {
            const parsed = parseDailyContent(report.content);
            return (
              <div key={report.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <strong style={{ fontSize: 14 }}>产品 #{report.product_id} 工作日报</strong>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{new Date(report.created_at).toLocaleString("zh-CN")}</span>
                    </div>
                    {!expandedId && (
                      <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                        {parsed.progress && (
                          <div style={{ flex: 1, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                            <span style={{ color: "#4ade80", fontWeight: 600 }}>✅ 进展：</span>
                            {parsed.progress.substring(0, 120)}
                          </div>
                        )}
                        {parsed.problems && (
                          <div style={{ flex: 1, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                            <span style={{ color: "#fbbf24", fontWeight: 600 }}>⚠️ 问题：</span>
                            {parsed.problems.substring(0, 120)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="btn-secondary btn-sm" onClick={() => downloadWord(report.id)}>📥 Word</button>
                    <button className="btn-danger" onClick={() => deleteReport(report.id)}>删除</button>
                  </div>
                </div>

                {expandedId === report.id && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 220, background: "var(--bg-primary)", borderRadius: 8, padding: 12, borderLeft: "3px solid #4ade80" }}>
                        <strong style={{ color: "#4ade80", fontSize: 13 }}>✅ 今日进展</strong>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, lineHeight: 1.6, margin: "8px 0 0", color: "var(--text-primary)" }}>{parsed.progress || "暂无"}</pre>
                      </div>
                      <div style={{ flex: 1, minWidth: 220, background: "var(--bg-primary)", borderRadius: 8, padding: 12, borderLeft: "3px solid #fbbf24" }}>
                        <strong style={{ color: "#fbbf24", fontSize: 13 }}>⚠️ 存在问题</strong>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, lineHeight: 1.6, margin: "8px 0 0", color: "var(--text-primary)" }}>{parsed.problems || "暂无"}</pre>
                      </div>
                      <div style={{ flex: 1, minWidth: 220, background: "var(--bg-primary)", borderRadius: 8, padding: 12, borderLeft: "3px solid var(--accent)" }}>
                        <strong style={{ color: "var(--accent-hover)", fontSize: 13 }}>📌 下一步计划</strong>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, lineHeight: 1.6, margin: "8px 0 0", color: "var(--text-primary)" }}>{parsed.plan || "暂无"}</pre>
                      </div>
                    </div>
                    <details style={{ marginTop: 12 }}>
                      <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--text-muted)" }}>查看原始内容</summary>
                      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, lineHeight: 1.6, color: "var(--text-secondary)", marginTop: 8, background: "var(--bg-primary)", padding: 12, borderRadius: 8 }}>{report.content}</pre>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
