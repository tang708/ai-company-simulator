"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import type { Product, Agent, PipelineMessage, GitHubFileInfo, GitHubBranchInfo } from "@/types";

export default function ProductDetailPage() {
  const params = useParams();
  const productId = Number(params.id);

  const [product, setProduct] = useState<Product | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ name: "", prd: "", repo_url: "", status: "" });
  const [saving, setSaving] = useState(false);

  const [pipelineInput, setPipelineInput] = useState("");
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineMessages, setPipelineMessages] = useState<PipelineMessage[]>([]);
  const [pipelineSummary, setPipelineSummary] = useState("");
  const [pipelineError, setPipelineError] = useState("");

  const [reportGenerating, setReportGenerating] = useState(false);

  // GitHub 仓库查看
  const [repoFiles, setRepoFiles] = useState<GitHubFileInfo[]>([]);
  const [repoBranches, setRepoBranches] = useState<GitHubBranchInfo[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [creatingRepo, setCreatingRepo] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [pRes, aRes] = await Promise.all([fetch(`/api/products/${productId}`), fetch("/api/agents")]);
      const [pJson, aJson] = await Promise.all([pRes.json(), aRes.json()]);
      if (pJson.success) {
        setProduct(pJson.data);
        setEditForm({ name: pJson.data.name, prd: pJson.data.prd || "", repo_url: pJson.data.repo_url || "", status: pJson.data.status });
      }
      if (aJson.success) setAgents(aJson.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [productId]);

  useEffect(() => { loadData(); }, [loadData]);

  function parseRepoUrl(url: string) {
    const m = url?.match(/github\.com\/([^/]+)\/([^/\s?#.]+)/);
    return m ? { owner: m[1], repo: m[2] } : null;
  }

  async function loadRepoContents() {
    if (!product?.repo_url) return;
    const parsed = parseRepoUrl(product.repo_url);
    if (!parsed) return;
    setRepoLoading(true);
    setRepoError("");
    try {
      const [fRes, bRes] = await Promise.all([
        fetch(`/api/github/files?owner=${parsed.owner}&repo=${parsed.repo}`),
        fetch(`/api/github/branches?owner=${parsed.owner}&repo=${parsed.repo}`),
      ]);
      const [fJson, bJson] = await Promise.all([fRes.json(), bRes.json()]);
      if (fJson.success) setRepoFiles(fJson.data);
      else setRepoError(fJson.error);
      if (bJson.success) setRepoBranches(bJson.data);
    } catch (err) { setRepoError("加载失败"); }
    finally { setRepoLoading(false); }
  }

  async function loadFileContents(filePath: string) {
    if (!product?.repo_url) return;
    const parsed = parseRepoUrl(product.repo_url);
    if (!parsed) return;
    setSelectedFile(filePath);
    try {
      const res = await fetch(`/api/github/files?owner=${parsed.owner}&repo=${parsed.repo}&file=${encodeURIComponent(filePath)}`);
      const json = await res.json();
      if (json.success && json.data.content) setFileContent(json.data.content);
    } catch { setFileContent("加载失败"); }
  }

  async function createRepo() {
    setCreatingRepo(true);
    try {
      const res = await fetch("/api/github/repos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, name: product?.name || "new-project", description: product?.prd || "" }),
      });
      const json = await res.json();
      if (json.success) {
        setProduct((prev) => prev ? { ...prev, repo_url: json.data.html_url } : prev);
        setEditForm((prev) => ({ ...prev, repo_url: json.data.html_url }));
      } else {
        const msg = json.error || "";
        if (msg.includes("权限不足") || msg.includes("not accessible") || msg.includes("Administration")) {
          // 权限相关错误 → 直接显示详细指引
          alert(msg);
        } else if (msg.includes("Token") || msg.includes("Bad credentials")) {
          alert("GitHub Token 未配置或已失效。\n\n请在 .env.local 中设置有效的 GITHUB_TOKEN\n（前往 https://github.com/settings/tokens 创建）");
        } else {
          alert(`创建失败: ${msg}`);
        }
      }
    } catch (err) { alert("网络错误"); }
    finally { setCreatingRepo(false); }
  }

  async function saveProduct() {
    setSaving(true);
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      const json = await res.json();
      if (json.success) { setProduct(json.data); setEditMode(false); }
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  }

  async function runAIPipeline() {
    if (!pipelineInput.trim()) return;
    setPipelineRunning(true);
    setPipelineError("");
    setPipelineMessages([]);
    try {
      const res = await fetch("/api/pipeline", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, inputPrompt: pipelineInput, triggerType: "manual" }),
      });
      const json = await res.json();
      if (json.success) { setPipelineMessages(json.data.messages); setPipelineSummary(json.data.run.summary || ""); }
      else { setPipelineError(json.error); }
    } catch (err) { setPipelineError("网络错误"); }
    finally { setPipelineRunning(false); }
  }

  async function generateReport(type: "team_report" | "daily_report") {
    setReportGenerating(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId, type }),
      });
      const json = await res.json();
      if (json.success) { alert(`报告已生成: ${json.data.title}`); window.open(`/reports`, "_blank"); }
      else { alert(`失败: ${json.error}`); }
    } catch { alert("网络错误"); }
    finally { setReportGenerating(false); }
  }

  if (loading) return <div className="loading-spinner" />;
  if (!product) return <div className="card">产品不存在</div>;

  const repoInfo = product.repo_url ? parseRepoUrl(product.repo_url) : null;

  return (
    <div>
      <a href="/products" style={{ color: "var(--text-secondary)", fontSize: 13, textDecoration: "none", marginBottom: 16, display: "inline-block" }}>← 返回产品列表</a>

      {/* 产品信息卡片 */}
      <div className="card" style={{ marginBottom: 24 }}>
        {editMode ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input className="input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="产品名称" />
            <textarea className="textarea" value={editForm.prd} onChange={(e) => setEditForm({ ...editForm, prd: e.target.value })} placeholder="PRD" />
            <input className="input" value={editForm.repo_url} onChange={(e) => setEditForm({ ...editForm, repo_url: e.target.value })} placeholder="仓库 URL" />
            <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              <option value="idea">构思中</option><option value="dev">开发中</option><option value="online">已上线</option>
            </select>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" onClick={saveProduct} disabled={saving}>{saving ? "保存中..." : "保存"}</button>
              <button className="btn-secondary" onClick={() => setEditMode(false)}>取消</button>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                  <span className={`status-badge status-${product.status}`}>{statusLabel(product.status)}</span>
                  {product.repo_url ? (
                    <a href={product.repo_url} target="_blank" rel="noreferrer" className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px", textDecoration: "none" }}>🔗 仓库</a>
                  ) : (
                    <button className="btn-secondary" onClick={createRepo} disabled={creatingRepo} style={{ fontSize: 12, padding: "4px 10px" }}>
                      {creatingRepo ? "..." : "📦 创建仓库"}
                    </button>
                  )}
                  <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{new Date(product.created_at).toLocaleString("zh-CN")}</span>
                </div>
                <div className="card" style={{ background: "var(--bg-primary)", padding: 16, marginTop: 8 }}>
                  <h3 className="text-sm font-semibold mb-2">📋 PRD</h3>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.8, color: "var(--text-secondary)", margin: 0 }}>{product.prd || "暂无PRD"}</pre>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-secondary" onClick={() => setEditMode(true)}>✏️ 编辑</button>
                <button className="btn-secondary" onClick={() => generateReport("daily_report")} disabled={reportGenerating}>{reportGenerating ? "..." : "📝 日报"}</button>
                <button className="btn-primary" onClick={() => generateReport("team_report")} disabled={reportGenerating}>{reportGenerating ? "..." : "📊 团队报告"}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* GitHub 仓库浏览面板 */}
      {repoInfo && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 className="text-lg font-semibold">📁 代码仓库</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }} onClick={loadRepoContents}>
                {repoLoading ? "加载中..." : "🔄 刷新"}
              </button>
              <a href={product.repo_url!} target="_blank" rel="noreferrer" className="btn-secondary" style={{ fontSize: 12, padding: "4px 10px", textDecoration: "none" }}>
                ↗ 在GitHub打开
              </a>
            </div>
          </div>

          {repoError && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>{repoError}</div>}

          {repoBranches.length > 0 && (
            <div style={{ marginBottom: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>分支: </span>
              {repoBranches.map((b) => (
                <span key={b.name} style={{ fontSize: 11, background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 4, padding: "2px 8px" }}>{b.name}</span>
              ))}
            </div>
          )}

          {repoFiles.length > 0 ? (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "0 0 250px", maxHeight: 400, overflowY: "auto", background: "var(--bg-primary)", borderRadius: 8, padding: 8 }}>
                {repoFiles.map((f) => (
                  <div key={f.path} onClick={() => f.type === "file" && loadFileContents(f.path)} style={{
                    padding: "6px 8px", borderRadius: 4, cursor: f.type === "file" ? "pointer" : "default",
                    fontSize: 12, display: "flex", alignItems: "center", gap: 6,
                    background: selectedFile === f.path ? "rgba(99,102,241,0.2)" : "transparent",
                    color: f.type === "file" ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: f.type === "dir" ? 600 : 400,
                  }}>
                    <span>{f.type === "dir" ? "📁" : "📄"}</span>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, minWidth: 300, background: "var(--bg-primary)", borderRadius: 8, padding: 12, maxHeight: 400, overflowY: "auto" }}>
                {selectedFile ? (
                  <div>
                    <div style={{ fontSize: 12, color: "var(--accent)", marginBottom: 8, fontFamily: "monospace" }}>{selectedFile}</div>
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "Consolas, monospace", fontSize: 11, lineHeight: 1.5, color: "var(--text-primary)", margin: 0 }}>{fileContent || "加载中..."}</pre>
                  </div>
                ) : (
                  <div style={{ color: "var(--text-secondary)", fontSize: 13, textAlign: "center", paddingTop: 40 }}>
                    点击左侧文件查看内容
                  </div>
                )}
              </div>
            </div>
          ) : repoLoading ? (
            <div className="loading-spinner" />
          ) : (
            <div style={{ color: "var(--text-secondary)", fontSize: 12, fontStyle: "italic", padding: "8px 0" }}>
              点击「刷新」加载仓库文件列表
            </div>
          )}
        </div>
      )}

      {/* AI 团队 */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="text-lg font-semibold mb-4">🤖 AI 团队（6角色）</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {agents.map((agent) => (
            <div key={agent.id} style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 16px", minWidth: 150, flex: 1 }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{roleEmoji(agent.role)}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{agent.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>{agent.role}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {(agent.skills || []).slice(0, 3).map((s: string, i: number) => (
                  <span key={i} style={{ fontSize: 10, background: "rgba(99,102,241,0.15)", color: "var(--accent-hover)", padding: "2px 6px", borderRadius: 4 }}>{s}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Pipeline */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 className="text-lg font-semibold mb-4">🧠 AI Pipeline</h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 13, marginBottom: 12 }}>
          输入问题，AI团队顺序分析。可含URL自动爬取。
        </p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="input" placeholder="分析用户积分系统的可行性 https://..." value={pipelineInput}
            onChange={(e) => setPipelineInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runAIPipeline()} />
          <button className="btn-primary" onClick={runAIPipeline} disabled={pipelineRunning || !pipelineInput.trim()} style={{ whiteSpace: "nowrap" }}>
            {pipelineRunning ? "执行中..." : "🚀 执行"}
          </button>
        </div>
        {pipelineError && <div style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{pipelineError}</div>}

        {pipelineMessages.length > 0 && (
          <div>
            {pipelineSummary && (
              <div className="card" style={{ marginBottom: 16, borderColor: "var(--accent)", background: "rgba(99,102,241,0.05)" }}>
                <strong>📌 执行摘要：</strong>{pipelineSummary}
              </div>
            )}
            {pipelineMessages.map((msg, idx) => {
              let structured = null;
              try { if (msg.structured_output) structured = JSON.parse(msg.structured_output); } catch {}
              return (
                <div key={idx} className="message-bubble">
                  <span className="role-tag" style={{ background: roleColor(msg.role), color: "#fff" }}>{roleEmoji(msg.role)} {msg.role}</span>
                  {structured?.summary && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "var(--accent-hover)" }}>{structured.summary}</div>}
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13, lineHeight: 1.7, margin: 0, color: "var(--text-primary)" }}>{msg.content}</pre>
                  {structured && (
                    <details style={{ marginTop: 8 }}>
                      <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--accent)" }}>结构化输出</summary>
                      <pre style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 11, lineHeight: 1.5, color: "var(--text-secondary)", background: "var(--bg-primary)", padding: 8, borderRadius: 6, marginTop: 6 }}>{JSON.stringify(structured, null, 2)}</pre>
                    </details>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function statusLabel(s: string) { const m: Record<string, string> = { idea: "构思中", dev: "开发中", online: "已上线" }; return m[s] || s; }
function roleEmoji(r: string) { const m: Record<string, string> = { PM: "📊", TechLead: "💻", Dev: "⚙️", QA: "🔍", Ops: "🛡️", Data: "📈" }; return m[r] || "🤖"; }
function roleColor(r: string) { const m: Record<string, string> = { PM: "#6366f1", TechLead: "#3b82f6", Dev: "#f59e0b", QA: "#22c55e", Ops: "#ef4444", Data: "#8b5cf6" }; return m[r] || "#94a3b8"; }
