"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type { Product, TeamReport, DailyReport } from "@/types";
import { STATUS_LABEL } from "@/types";

const ROLE_LABELS: Record<string, { emoji: string; color: string; name: string }> = {
  PM: { emoji: "📊", color: "#6366f1", name: "产品经理" },
  TechLead: { emoji: "💻", color: "#3b82f6", name: "技术负责人" },
  Dev: { emoji: "⚙️", color: "#f59e0b", name: "开发工程师" },
  QA: { emoji: "🔍", color: "#22c55e", name: "测试工程师" },
  Ops: { emoji: "🛡️", color: "#ef4444", name: "运维工程师" },
  Data: { emoji: "📈", color: "#8b5cf6", name: "数据分析师" },
};

interface RoleProgress {
  role: string; status: "pending" | "running" | "done" | "error"; content?: string; summary?: string; error?: string;
}

export default function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [teamReports, setTeamReports] = useState<TeamReport[]>([]);
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [progressData, setProgressData] = useState<{
    productId: number; productName: string; percent: number; currentRole: string; roles: RoleProgress[]; summary: string; done: boolean;
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
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function refreshAll() { setRefreshing(true); setToast("🔄 刷新中..."); await loadData(); setToast("✅ 已刷新"); setTimeout(() => setToast(""), 2000); }

  function getLatestTeam(pid: number) { return teamReports.filter(r => r.product_id === pid)[0] || null; }
  function getLatestDaily(pid: number) { return dailyReports.filter(r => r.product_id === pid)[0] || null; }

  function initRoles(): RoleProgress[] {
    return ["PM", "TechLead", "Dev", "QA", "Ops", "Data"].map(r => ({ role: r, status: "pending" as const }));
  }

  async function runAITeamSSE(product: Product) {
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
        case "role_done": { const i = roles.findIndex(r => r.role === data.role); if (i >= 0) { const s = data.structured ? (data.structured as Record<string,unknown>).summary as string : ""; roles[i] = { ...roles[i], status: "done", content: data.content as string, summary: s }; } return { ...prev, roles, percent: data.progress as number || prev.percent }; }
        case "role_error": { const i = roles.findIndex(r => r.role === data.role); if (i >= 0) roles[i] = { ...roles[i], status: "error", error: data.error as string }; return { ...prev, roles }; }
        case "summary": return { ...prev, summary: data.summary as string || prev.summary, percent: data.progress as number || prev.percent };
        case "complete": return { ...prev, percent: 100, summary: data.summary as string || prev.summary, done: true };
        case "done": setToast(`✅ 「${prev.productName}」分析完成！`); loadData(); return prev;
        case "error": setToast(`❌ ${data.message || ""}`); return { ...prev, done: true };
        default: return prev;
      }
    });
  }

  function cancelPipeline() { if (abortRef.current) abortRef.current.abort(); setProgressData(null); setToast("已取消"); }

  async function generateDaily(product: Product) {
    setToast(`📝 「${product.name}」日报生成中...`);
    try {
      const res = await fetch("/api/daily-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: product.id }) });
      const json = await res.json();
      if (json.success) { setToast(`✅ 「${product.name}」日报已生成！`); await loadData(); } else { setToast(`❌ ${json.error}`); }
    } catch { setToast("❌ 网络错误"); }
  }

  if (loading) return <div><h1 className="text-2xl font-bold mb-6">📊 AI公司控制台</h1><div className="loading-spinner" /></div>;

  // 全局报告摘要
  const latestTeam = teamReports[0];
  const latestDaily = dailyReports[0];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <h1 className="text-2xl font-bold">📊 AI公司控制台</h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{products.length}产品 | {teamReports.length}报告 | {dailyReports.length}日报</span>
          <button className="btn-secondary" onClick={refreshAll} disabled={refreshing} style={{ fontSize: 12, padding: "5px 12px" }}>
            {refreshing ? "..." : "🔄 刷新"}
          </button>
          <a href="/products" className="btn-primary" style={{ textDecoration: "none", fontSize: 12, padding: "5px 12px" }}>+ 创建产品</a>
        </div>
      </div>

      {/* 最新报告摘要卡片 */}
      <div className="grid-2" style={{ marginBottom: 20, gap: 12 }}>
        {latestTeam && (
          <div className="card" style={{ borderLeft: "3px solid var(--accent)", padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <strong style={{ fontSize: 14 }}>📊 最新团队报告</strong>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{new Date(latestTeam.created_at).toLocaleString("zh-CN")}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {latestTeam.summary?.substring(0, 300) || "暂无摘要"}
            </div>
            <a href="/team-reports" style={{ fontSize: 11, color: "var(--accent)", marginTop: 6, display: "inline-block" }}>查看全部 →</a>
          </div>
        )}
        {latestDaily && (
          <div className="card" style={{ borderLeft: "3px solid #22c55e", padding: "14px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <strong style={{ fontSize: 14 }}>📋 最新日报</strong>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{new Date(latestDaily.created_at).toLocaleString("zh-CN")}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              {latestDaily.content?.substring(0, 300) || "暂无内容"}
            </div>
            <a href="/daily-reports" style={{ fontSize: 11, color: "var(--accent)", marginTop: 6, display: "inline-block" }}>查看全部 →</a>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="card" style={{ marginBottom: 16, background: "rgba(99,102,241,0.1)", borderColor: "var(--accent)", padding: "10px 14px", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
          <span>{toast}</span>
          <button onClick={() => setToast("")} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
      )}

      {/* SSE 进度面板 */}
      {progressData && (
        <div className="card" style={{ marginBottom: 20, borderColor: "var(--accent)", background: "rgba(99,102,241,0.03)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <strong>🤖 「{progressData.productName}」分析中...</strong>
            <button onClick={cancelPipeline} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 12px", color: "var(--text-secondary)", cursor: "pointer", fontSize: 12 }}>取消</button>
          </div>
          <div style={{ height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
            <div style={{ height: "100%", width: `${progressData.percent}%`, background: progressData.done ? "#22c55e" : "linear-gradient(90deg, var(--accent), #818cf8)", borderRadius: 3, transition: "width 0.5s ease" }} />
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12 }}>{progressData.done ? "✅ 完成" : `⏳ ${progressData.percent}%`}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
            {progressData.roles.map(rp => {
              const info = ROLE_LABELS[rp.role] || { emoji: "🤖", color: "#94a3b8", name: rp.role };
              return (
                <div key={rp.role} style={{ background: "var(--bg-primary)", borderRadius: 8, padding: "8px 10px", border: `2px solid ${rp.status === "done" ? "#22c55e" : rp.status === "running" ? info.color : rp.status === "error" ? "var(--danger)" : "var(--border)"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14 }}>{info.emoji}</span>
                    <span style={{ fontSize: 11, fontWeight: 600 }}>{info.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12 }}>{rp.status === "done" ? "✅" : rp.status === "running" ? "⏳" : rp.status === "error" ? "❌" : "⬜"}</span>
                  </div>
                  {rp.summary && <div style={{ fontSize: 10, color: "var(--text-secondary)", marginTop: 4 }}>{rp.summary.substring(0, 50)}</div>}
                </div>
              );
            })}
          </div>
          {progressData.summary && (
            <div style={{ marginTop: 14, padding: 10, background: "var(--bg-primary)", borderRadius: 8, borderLeft: "3px solid var(--accent)", fontSize: 12, lineHeight: 1.6 }}><strong>📌 摘要：</strong>{progressData.summary}</div>
          )}
        </div>
      )}

      {products.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: 48, color: "var(--text-secondary)" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
          <p style={{ marginBottom: 16 }}>还没有任何产品，点击创建开始使用 AI 团队</p>
          <a href="/products" className="btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>创建第一个产品</a>
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
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <strong style={{ fontSize: 15 }}>{product.name}</strong>
                      <span className={`status-badge status-${product.status}`}>{STATUS_LABEL[product.status]}</span>
                    </div>
                    <div style={{ color: "var(--text-secondary)", fontSize: 12 }}>{product.prd ? product.prd.substring(0, 80) + (product.prd.length > 80 ? "..." : "") : "暂无PRD"}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <button className="btn-primary" style={{ fontSize: 11, padding: "5px 12px" }} onClick={() => runAITeamSSE(product)} disabled={!!progressData}>{isRunning ? "⏳ 分析中..." : "🤖 运行AI团队"}</button>
                    <a href={`/products/${product.id}`} className="btn-secondary" style={{ fontSize: 11, padding: "5px 10px", textDecoration: "none" }}>详情</a>
                    <button className="btn-secondary" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => generateDaily(product)}>📝 日报</button>
                  </div>
                </div>
                {teamRp && (
                  <div style={{ background: "var(--bg-primary)", borderRadius: 8, padding: "10px 12px", borderLeft: "3px solid var(--accent)", marginBottom: dailyRp ? 6 : 0 }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>📊 最新团队报告 · {new Date(teamRp.created_at).toLocaleString("zh-CN")}</div>
                    <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5 }}>{teamRp.summary?.substring(0, 200) || "报告已生成"}</div>
                  </div>
                )}
                {dailyRp && (
                  <div style={{ background: "var(--bg-primary)", borderRadius: 8, padding: "10px 12px", borderLeft: "3px solid #22c55e" }}>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 4 }}>📋 最新日报 · {new Date(dailyRp.created_at).toLocaleString("zh-CN")}</div>
                    <div style={{ fontSize: 12, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{dailyRp.content?.substring(0, 200)}</div>
                  </div>
                )}
                {!teamRp && !dailyRp && !isRunning && (
                  <div style={{ color: "var(--text-secondary)", fontSize: 11, fontStyle: "italic", padding: "6px 0" }}>点击「运行AI团队」让 6 个 AI 角色分析，或「📝 日报」生成工作日报</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
