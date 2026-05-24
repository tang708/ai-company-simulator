"use client";

import { useEffect, useState } from "react";
import type { Product, TeamReport, AgentRole } from "@/types";
import { STATUS_LABEL, ROLE_META } from "@/types";

const ROLE_KEYS: { key: keyof TeamReport; role: AgentRole }[] = [
  { key: "pm_output", role: "PM" },
  { key: "tech_output", role: "TechLead" },
  { key: "dev_output", role: "Dev" },
  { key: "qa_output", role: "QA" },
  { key: "ops_output", role: "Ops" },
  { key: "data_output", role: "Data" },
];

export default function TeamReportsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [reports, setReports] = useState<TeamReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/products");
        const json = await res.json();
        if (json.success) setProducts(json.data);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  async function loadReports(productId: number) {
    setSelectedProductId(productId);
    setReportsLoading(true);
    try {
      const res = await fetch(`/api/team-reports?product_id=${productId}`);
      const json = await res.json();
      if (json.success) setReports(json.data);
    } catch (err) { console.error(err); }
    finally { setReportsLoading(false); }
  }

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

  async function uploadToGitHub(report: TeamReport) {
    const product = products.find(p => p.id === report.product_id);
    if (!product?.repo_url) { alert("该产品没有关联GitHub仓库"); return; }
    setUploadingId(report.id);
    try {
      const m = product.repo_url.match(/github\.com\/([^/]+)\/([^/\s?#.]+)/);
      if (!m) { alert("仓库URL格式不正确"); return; }
      const owner = m[1], repo = m[2];
      const date = new Date(report.created_at).toISOString().split("T")[0];
      const ts = Date.now();
      let mdContent = `# 团队报告 #${report.id}\n\n日期：${date}\n\n`;
      if (report.summary) mdContent += `## 执行摘要\n\n${report.summary}\n\n`;
      for (const { key, role } of ROLE_KEYS) {
        const content = report[key] as string | null;
        if (content) mdContent += `## ${ROLE_META[role].name} (${role})\n\n${content}\n\n`;
      }
      const res = await fetch("/api/github/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner, repo,
          filePath: `docs/team-reports/${date}-report${report.id}-${ts}.md`,
          content: mdContent,
          message: `docs: 添加团队报告 #${report.id} (${date})`,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await fetch(`/api/team-reports/${report.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ github_uploaded: 1 }) });
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, github_uploaded: 1 } : r));
        alert("✅ 已上传至GitHub仓库！");
      } else alert(`上传失败: ${json.error}`);
    } catch { alert("上传失败"); }
    finally { setUploadingId(null); }
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}><div className="loading-spinner" /></div>;

  const selectedProduct = products.find(p => p.id === selectedProductId);

  return (
    <div>
      <div className="page-header">
        <h1>📋 团队报告</h1>
        {selectedProduct && (
          <button className="btn-secondary btn-sm" onClick={() => { setSelectedProductId(null); setReports([]); }}>← 返回产品列表</button>
        )}
      </div>

      {!selectedProductId ? (
        <div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 16 }}>选择产品查看其团队报告</p>
          {products.length === 0 ? (
            <div className="card empty-state"><div className="empty-state-icon">📦</div><p>暂无产品</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {products.map(product => (
                <div key={product.id} className="card" style={{ cursor: "pointer" }} onClick={() => loadReports(product.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <strong style={{ fontSize: 15 }}>{product.name}</strong>
                        <span className={`status-badge status-${product.status}`}>{STATUS_LABEL[product.status]}</span>
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{product.prd ? product.prd.substring(0, 60) + "..." : "暂无PRD"}</div>
                    </div>
                    <span style={{ color: "var(--accent)", fontSize: 13 }}>查看报告 →</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 16, padding: "12px 16px", background: "var(--bg-card)", borderRadius: 10, border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <strong style={{ fontSize: 15 }}>{selectedProduct?.name}</strong>
              <span className={`status-badge status-${selectedProduct?.status}`}>{STATUS_LABEL[selectedProduct?.status]}</span>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>· 团队报告</span>
            </div>
          </div>

          {reportsLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="loading-spinner" /></div>
          ) : reports.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-icon">📋</div>
              <p>暂无团队报告</p>
              <a href="/" style={{ color: "var(--accent)" }}>前往控制台运行团队 →</a>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {reports.map(report => (
                <div key={report.id} className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ cursor: "pointer", flex: 1 }} onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <strong style={{ fontSize: 14 }}>团队报告 #{report.id}</strong>
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
                      <button className="btn-secondary btn-sm" onClick={() => uploadToGitHub(report)} disabled={uploadingId === report.id}>
                        {report.github_uploaded ? "✅ 已上传" : uploadingId === report.id ? "上传中..." : "🐙 上传GitHub"}
                      </button>
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
      )}
    </div>
  );
}
