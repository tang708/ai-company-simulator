"use client";

import { useEffect, useState } from "react";
import type { Report } from "@/types";

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/reports");
        const json = await res.json();
        if (json.success) setReports(json.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredReports = filter === "all" ? reports : reports.filter((r) => r.type === filter);

  async function deleteReport(id: number) {
    if (!confirm("确定删除此报告？")) return;
    try {
      await fetch(`/api/reports/${id}`, { method: "DELETE" });
      setReports(reports.filter((r) => r.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">📋 报告中心</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {["all", "team_report", "daily_report"].map((f) => (
          <button
            key={f}
            className={filter === f ? "btn-primary" : "btn-secondary"}
            style={{ fontSize: 13 }}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "全部" : f === "team_report" ? "团队报告" : "日报"}
          </button>
        ))}
      </div>

      {filteredReports.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--text-secondary)", padding: 48 }}>
          暂无报告，前往产品详情页生成报告
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredReports.map((r) => (
            <div key={r.id} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1, cursor: "pointer" }} onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span>{r.type === "team_report" ? "📊" : "📝"}</span>
                    <strong style={{ fontSize: 15 }}>{r.title}</strong>
                    <span className="status-badge status-planning">{r.type === "team_report" ? "团队报告" : "日报"}</span>
                    {r.score && <span className={`status-badge ${r.score >= 80 ? "status-launched" : r.score >= 60 ? "status-developing" : "status-maintenance"}`}>评分: {r.score}</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
                    {r.report_date && `📅 ${r.report_date}`} · {new Date(r.created_at).toLocaleString("zh-CN")}
                  </div>
                  {r.summary && !expandedId && <div style={{ fontSize: 13, color: "var(--text-secondary)", fontStyle: "italic" }}>{r.summary}</div>}
                </div>
                <button className="btn-secondary" onClick={() => deleteReport(r.id)} style={{ fontSize: 12, padding: "6px 12px", color: "var(--danger)" }}>
                  删除
                </button>
              </div>

              {expandedId === r.id && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.8, color: "var(--text-primary)", margin: 0 }}>
                    {r.content}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
