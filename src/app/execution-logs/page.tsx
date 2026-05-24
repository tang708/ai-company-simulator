"use client";

import { useEffect, useState } from "react";
import type { Product, DailyReport } from "@/types";
import { STATUS_LABEL } from "@/types";

export default function ExecutionLogsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [logs, setLogs] = useState<DailyReport[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
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

  async function loadLogs(productId: number) {
    setSelectedProductId(productId);
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/daily-reports?product_id=${productId}`);
      const json = await res.json();
      if (json.success) setLogs(json.data);
    } catch (err) { console.error(err); }
    finally { setLogsLoading(false); }
  }

  async function deleteLog(id: number) {
    if (!confirm("确定删除此执行记录？")) return;
    try {
      await fetch(`/api/daily-reports/${id}`, { method: "DELETE" });
      setLogs(logs.filter(l => l.id !== id));
    } catch (err) { console.error(err); }
  }

  function downloadWord(id: number) {
    window.open(`/api/export/word?type=daily&id=${id}`, "_blank");
  }

  async function uploadToGitHub(log: DailyReport) {
    const product = products.find(p => p.id === log.product_id);
    if (!product?.repo_url) { alert("该产品没有关联GitHub仓库"); return; }
    setUploadingId(log.id);
    try {
      const m = product.repo_url.match(/github\.com\/([^/]+)\/([^/\s?#.]+)/);
      if (!m) { alert("仓库URL格式不正确"); return; }
      const owner = m[1], repo = m[2];
      const date = new Date(log.created_at).toISOString().split("T")[0];
      const ts = Date.now();
      const res = await fetch("/api/github/files", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner, repo,
          filePath: `docs/execution-logs/${date}-log${log.id}-${ts}.md`,
          content: log.content,
          message: `docs: 添加执行记录 #${log.id} (${date})`,
        }),
      });
      const json = await res.json();
      if (json.success) {
        await fetch(`/api/daily-reports/${log.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ github_uploaded: 1 }) });
        setLogs(prev => prev.map(l => l.id === log.id ? { ...l, github_uploaded: 1 } : l));
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
        <h1>📝 执行记录</h1>
        {selectedProduct && (
          <button className="btn-secondary btn-sm" onClick={() => { setSelectedProductId(null); setLogs([]); }}>← 返回产品列表</button>
        )}
      </div>

      {!selectedProductId ? (
        <div>
          <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 16 }}>选择产品查看其执行记录</p>
          {products.length === 0 ? (
            <div className="card empty-state"><div className="empty-state-icon">📦</div><p>暂无产品</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {products.map(product => (
                <div key={product.id} className="card" style={{ cursor: "pointer" }} onClick={() => loadLogs(product.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                        <strong style={{ fontSize: 15 }}>{product.name}</strong>
                        <span className={`status-badge status-${product.status}`}>{STATUS_LABEL[product.status]}</span>
                      </div>
                      <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{product.prd ? product.prd.substring(0, 60) + "..." : "暂无PRD"}</div>
                    </div>
                    <span style={{ color: "var(--accent)", fontSize: 13 }}>查看记录 →</span>
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
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>· 执行记录</span>
            </div>
          </div>

          {logsLoading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 40 }}><div className="loading-spinner" /></div>
          ) : logs.length === 0 ? (
            <div className="card empty-state">
              <div className="empty-state-icon">📝</div>
              <p>暂无执行记录</p>
              <a href="/" style={{ color: "var(--accent)" }}>前往控制台运行团队 →</a>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {logs.map(log => {
                const isExpanded = expandedId === log.id;
                const taskLine = log.content.split("\n").find(l => l.startsWith("任务：")) || "";
                return (
                  <div key={log.id} style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    <div
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", cursor: "pointer" }}
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{isExpanded ? "▼" : "▶"}</span>
                        <strong style={{ fontSize: 13, flexShrink: 0 }}>#{log.id}</strong>
                        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{new Date(log.created_at).toLocaleString("zh-CN")}</span>
                        {taskLine && !isExpanded && <span style={{ fontSize: 11, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{taskLine}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 8 }} onClick={e => e.stopPropagation()}>
                        <button className="btn-secondary btn-sm" onClick={() => downloadWord(log.id)}>📥 Word</button>
                        <button className="btn-secondary btn-sm" onClick={() => uploadToGitHub(log)} disabled={uploadingId === log.id}>
                          {log.github_uploaded ? "✅ 已上传" : uploadingId === log.id ? "上传中..." : "🐙 上传GitHub"}
                        </button>
                        <button className="btn-danger" onClick={() => deleteLog(log.id)}>删除</button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div style={{ padding: "0 14px 14px", maxHeight: 400, overflowY: "auto" }}>
                        <div style={{ background: "var(--bg-primary)", borderRadius: 8, padding: 12, fontSize: 12, lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
                          {log.content}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
