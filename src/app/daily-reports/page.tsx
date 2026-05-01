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
      setReports(reports.filter((r) => r.id !== id));
    } catch (err) { console.error(err); }
  }

  function parseDailyContent(content: string) {
    const progressMatch = content.match(/今日进展[：:]\s*([\s\S]*?)(?=存在的问题|下一步计划|$)/i);
    const problemMatch = content.match(/存在的问题[：:]\s*([\s\S]*?)(?=下一步计划|$)/i);
    const planMatch = content.match(/下一步计划[：:]\s*([\s\S]*?)$/i);

    return {
      progress: progressMatch ? progressMatch[1].trim() : "",
      problems: problemMatch ? problemMatch[1].trim() : "",
      plan: planMatch ? planMatch[1].trim() : "",
    };
  }

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">📋 工作日报</h1>

      {reports.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}>
          暂无日报，前往 <a href="/" style={{ color: "var(--accent)" }}>控制台</a> 为产品生成日报
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {reports.map((report) => {
            const parsed = parseDailyContent(report.content);
            return (
              <div key={report.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span>📋</span>
                      <strong>产品 #{report.product_id} 工作日报</strong>
                      <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {new Date(report.created_at).toLocaleString("zh-CN")}
                      </span>
                    </div>

                    {!expandedId && (
                      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                        {parsed.progress && (
                          <div style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                            <span style={{ color: "#4ade80", fontWeight: 600 }}>✅ 今日进展：</span>
                            {parsed.progress.substring(0, 150)}
                          </div>
                        )}
                        {parsed.problems && (
                          <div style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                            <span style={{ color: "#fbbf24", fontWeight: 600 }}>⚠️ 存在问题：</span>
                            {parsed.problems.substring(0, 150)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <button className="btn-secondary" onClick={() => deleteReport(report.id)} style={{ fontSize: 12, padding: "6px 12px", color: "var(--danger)" }}>
                    删除
                  </button>
                </div>

                {expandedId === report.id && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                      <div className="card" style={{ flex: 1, minWidth: 250, background: "var(--bg-primary)", borderLeft: "3px solid #4ade80" }}>
                        <strong style={{ color: "#4ade80", fontSize: 14 }}>✅ 今日进展</strong>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, margin: "8px 0 0", color: "var(--text-primary)" }}>
                          {parsed.progress || "暂无"}
                        </pre>
                      </div>
                      <div className="card" style={{ flex: 1, minWidth: 250, background: "var(--bg-primary)", borderLeft: "3px solid #fbbf24" }}>
                        <strong style={{ color: "#fbbf24", fontSize: 14 }}>⚠️ 存在问题</strong>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, margin: "8px 0 0", color: "var(--text-primary)" }}>
                          {parsed.problems || "暂无"}
                        </pre>
                      </div>
                      <div className="card" style={{ flex: 1, minWidth: 250, background: "var(--bg-primary)", borderLeft: "3px solid var(--accent)" }}>
                        <strong style={{ color: "var(--accent-hover)", fontSize: 14 }}>📌 下一步计划</strong>
                        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, margin: "8px 0 0", color: "var(--text-primary)" }}>
                          {parsed.plan || "暂无"}
                        </pre>
                      </div>
                    </div>
                    <details style={{ marginTop: 12 }}>
                      <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-secondary)" }}>查看原始内容</summary>
                      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.6, color: "var(--text-secondary)", marginTop: 8, background: "var(--bg-primary)", padding: 12, borderRadius: 8 }}>
                        {report.content}
                      </pre>
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
