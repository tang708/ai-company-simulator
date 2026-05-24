"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { Product, TeamReport, DailyReport, AgentRole } from "@/types";
import { STATUS_LABEL, ROLE_META, MCP_LABELS, AGENT_ROLES } from "@/types";

interface RoleProgress {
  role: string; status: "pending" | "running" | "done" | "error"; summary?: string;
}

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [teamReports, setTeamReports] = useState<TeamReport[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);

  const [progressData, setProgressData] = useState<{
    productId: number; productName: string; percent: number; currentRole: string;
    roles: RoleProgress[]; summary: string; done: boolean;
  } | null>(null);
  const [toast, setToast] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [pRes, tRes, dRes] = await Promise.all([
        fetch("/api/products"), fetch("/api/team-reports"), fetch("/api/daily-reports"),
      ]);
      const [pJson, tJson, dJson] = await Promise.all([pRes.json(), tRes.json(), dRes.json()]);
      if (pJson.success) setProducts(pJson.data);
      if (tJson.success) setTeamReports(tJson.data);
      if (dJson.success) setDailyReports(dJson.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function getLatestTeam(pid: number) { return teamReports.filter(r => r.product_id === pid)[0] || null; }
  function getLatestDaily(pid: number) { return dailyReports.filter(r => r.product_id === pid)[0] || null; }

  function initRoles(): RoleProgress[] {
    return AGENT_ROLES.map(r => ({ role: r, status: "pending" as const }));
  }

  async function runAITeam(product: Product) {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const roles = initRoles();
    setProgressData({ productId: product.id, productName: product.name, percent: 0, currentRole: "PM", roles, summary: "", done: false });
    setToast("");
    try {
      const prdDesc = product.prd ? product.prd.substring(0, 500) : product.name;
      const res = await fetch("/api/pipeline/sse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, inputPrompt: `请分析产品：${product.name}\nPRD：${prdDesc}` }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const reader = res.body?.getReader(); if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop() || "";
        let evt = "";
        for (const l of lines) {
          if (l.startsWith("event: ")) { evt = l.slice(7).trim(); }
          else if (l.startsWith("data: ") && evt) { try { handleSSE(evt, JSON.parse(l.slice(6))); } catch {} evt = ""; }
        }
      }
    } catch (err) { if ((err as Error).name !== "AbortError") { setToast(`❌ ${(err as Error).message}`); setProgressData(null); } }
    finally { abortRef.current = null; }
  }

  function handleSSE(type: string, data: Record<string, unknown>) {
    setProgressData(prev => {
      if (!prev) return prev;
      const roles = [...prev.roles];
      switch (type) {
        case "role_start": { const i = roles.findIndex(r => r.role === data.role); if (i >= 0) roles[i] = { ...roles[i], status: "running" }; return { ...prev, roles, currentRole: data.role as string, percent: data.progress as number || prev.percent }; }
        case "role_done": { const i = roles.findIndex(r => r.role === data.role); if (i >= 0) { const s = data.structured ? (data.structured as Record<string,unknown>).summary as string : ""; roles[i] = { ...roles[i], status: "done", summary: s || (data.content as string)?.substring(0, 60) }; } return { ...prev, roles, percent: data.progress as number || prev.percent }; }
        case "role_error": { const i = roles.findIndex(r => r.role === data.role); if (i >= 0) roles[i] = { ...roles[i], status: "error" }; return { ...prev, roles }; }
        case "summary": return { ...prev, summary: data.summary as string || prev.summary, percent: data.progress as number || prev.percent };
        case "complete": return { ...prev, percent: 100, summary: data.summary as string || prev.summary, done: true };
        case "done": setToast(`✅ 「${prev.productName}」团队分析完成，执行记录已自动生成！`); loadData(); return prev;
        case "error": setToast(`❌ ${data.message || ""}`); return { ...prev, done: true };
        default: return prev;
      }
    });
  }

  function cancelPipeline() { if (abortRef.current) abortRef.current.abort(); setProgressData(null); setToast("已取消"); }

  async function generateTeamReport(product: Product) {
    setToast(`� 「${product.name}」团队报告生成中...`);
    try {
      const res = await fetch("/api/team-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: product.id }) });
      const json = await res.json();
      if (json.success) { setToast(`✅ 「${product.name}」团队报告已生成！`); await loadData(); } else { setToast(`❌ ${json.error}`); }
    } catch { setToast("❌ 网络错误"); }
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}><div className="loading-spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <h1>📊 控制台</h1>
        <div className="page-header-actions">
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{products.length} 产品 · {teamReports.length} 团队报告 · {dailyReports.length} 执行记录</span>
          <a href="/products" className="btn-primary btn-sm" style={{ textDecoration: "none" }}>+ 创建产品</a>
        </div>
      </div>

      {toast && (
        <div className="toast">
          <span>{toast}</span>
          <button onClick={() => setToast("")} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", marginLeft: 12, fontSize: 16 }}>×</button>
        </div>
      )}

      {progressData && (
        <div className="card" style={{ marginBottom: 20, borderColor: "var(--accent)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
            <strong style={{ fontSize: 14 }}>🤖 「{progressData.productName}」团队执行中</strong>
            <button className="btn-secondary btn-sm" onClick={cancelPipeline}>取消</button>
          </div>
          <div className="progress-bar" style={{ marginBottom: 8 }}>
            <div className={`progress-fill ${progressData.done ? "done" : ""}`} style={{ width: `${progressData.percent}%` }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>{progressData.done ? "✅ 完成" : `⏳ ${progressData.percent}%`}</div>
          <div className="grid-6">
            {progressData.roles.map(rp => {
              const meta = ROLE_META[rp.role as AgentRole] || { emoji: "🤖", name: rp.role, color: "#94a3b8" };
              return (
                <div key={rp.role} className={`role-card ${rp.status}`}>
                  <div className="role-emoji">{meta.emoji}</div>
                  <div className="role-name">{meta.name}</div>
                  <div className="role-status">{rp.status === "done" ? "✅" : rp.status === "running" ? "⏳" : rp.status === "error" ? "❌" : "⬜"}</div>
                  {rp.summary && <div style={{ fontSize: 9, color: "var(--text-muted)", marginTop: 4, lineHeight: 1.3 }}>{rp.summary.substring(0, 40)}</div>}
                </div>
              );
            })}
          </div>
          {progressData.summary && (
            <div style={{ marginTop: 14, padding: 10, background: "var(--bg-primary)", borderRadius: 8, borderLeft: "3px solid var(--accent)", fontSize: 12, lineHeight: 1.6 }}>
              <strong>📌 摘要：</strong>{progressData.summary}
            </div>
          )}
        </div>
      )}

      {products.length === 0 ? (
        <div className="card empty-state">
          <div className="empty-state-icon">📦</div>
          <p style={{ marginBottom: 16 }}>还没有任何产品</p>
          <a href="/products" className="btn-primary" style={{ textDecoration: "none" }}>创建第一个产品</a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {products.map(product => {
            const teamRp = getLatestTeam(product.id);
            const dailyRp = getLatestDaily(product.id);
            const isRunning = progressData?.productId === product.id && !progressData.done;
            return (
              <div key={product.id} className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                      <strong style={{ fontSize: 15 }}>{product.name}</strong>
                      <span className={`status-badge status-${product.status}`}>{STATUS_LABEL[product.status]}</span>
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>{product.prd ? product.prd.substring(0, 100) + (product.prd.length > 100 ? "..." : "") : "暂无PRD"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button className="btn-primary btn-sm" onClick={() => runAITeam(product)} disabled={!!progressData}>
                      {isRunning ? "⏳ 执行中..." : "🤖 运行团队"}
                    </button>
                    <button className="btn-secondary btn-sm" onClick={() => generateTeamReport(product)} disabled={!!progressData}>
                      📋 团队报告
                    </button>
                    <a href={`/products/${product.id}`} className="btn-secondary btn-sm" style={{ textDecoration: "none" }}>详情 →</a>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  {teamRp && (
                    <div style={{ flex: 1, background: "var(--bg-primary)", borderRadius: 8, padding: "8px 12px", borderLeft: "3px solid var(--accent)" }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>� 团队报告 · {new Date(teamRp.created_at).toLocaleDateString("zh-CN")}</div>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-secondary)" }}>{(teamRp.summary || "").substring(0, 150) || "已生成"}</div>
                    </div>
                  )}
                  {dailyRp && (
                    <div style={{ flex: 1, background: "var(--bg-primary)", borderRadius: 8, padding: "8px 12px", borderLeft: "3px solid var(--success)" }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 4 }}>📝 执行记录 · {new Date(dailyRp.created_at).toLocaleDateString("zh-CN")}</div>
                      <div style={{ fontSize: 12, lineHeight: 1.5, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>{dailyRp.content?.substring(0, 150)}</div>
                    </div>
                  )}
                  {!teamRp && !dailyRp && !isRunning && (
                    <div style={{ color: "var(--text-muted)", fontSize: 11, fontStyle: "italic", padding: "6px 0" }}>点击「运行团队」让 AI 团队分析产品</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
