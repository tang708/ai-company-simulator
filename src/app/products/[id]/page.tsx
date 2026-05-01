"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import type { Product, Agent, PipelineMessage, GitHubFileInfo, GitHubBranchInfo, AgentRole } from "@/types";
import { STATUS_LABEL, ROLE_META, MCP_LABELS, AGENT_ROLES } from "@/types";

interface RoleProgress {
  role: string; status: "pending" | "running" | "done" | "error"; summary?: string;
}

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
  const [progressData, setProgressData] = useState<{
    percent: number; roles: RoleProgress[]; summary: string; done: boolean; messages: PipelineMessage[];
  } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [repoFiles, setRepoFiles] = useState<GitHubFileInfo[]>([]);
  const [repoBranches, setRepoBranches] = useState<GitHubBranchInfo[]>([]);
  const [repoLoading, setRepoLoading] = useState(false);
  const [repoError, setRepoError] = useState("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [creatingRepo, setCreatingRepo] = useState(false);

  const [uploading, setUploading] = useState(false);

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
    setRepoLoading(true); setRepoError("");
    try {
      const [fRes, bRes] = await Promise.all([
        fetch(`/api/github/files?owner=${parsed.owner}&repo=${parsed.repo}`),
        fetch(`/api/github/branches?owner=${parsed.owner}&repo=${parsed.repo}`),
      ]);
      const [fJson, bJson] = await Promise.all([fRes.json(), bRes.json()]);
      if (fJson.success) setRepoFiles(fJson.data); else setRepoError(fJson.error);
      if (bJson.success) setRepoBranches(bJson.data);
    } catch { setRepoError("加载失败"); }
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
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, name: product?.name || "new-project", description: product?.prd || "" }),
      });
      const json = await res.json();
      if (json.success) {
        setProduct(prev => prev ? { ...prev, repo_url: json.data.html_url } : prev);
        setEditForm(prev => ({ ...prev, repo_url: json.data.html_url }));
      } else {
        const msg = json.error || "";
        if (msg.includes("权限不足") || msg.includes("not accessible") || msg.includes("Administration")) {
          alert(msg);
        } else if (msg.includes("Token") || msg.includes("Bad credentials")) {
          alert("GitHub Token 未配置或已失效。请在 .env.local 中设置有效的 GITHUB_TOKEN");
        } else { alert(`创建失败: ${msg}`); }
      }
    } catch { alert("网络错误"); }
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
    } catch { console.error("save failed"); }
    finally { setSaving(false); }
  }

  async function uploadDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("product_id", String(productId));
      const res = await fetch("/api/documents/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (json.success) { await loadData(); alert("文档上传成功！"); } else { alert(`上传失败: ${json.error}`); }
    } catch { alert("上传失败"); }
    finally { setUploading(false); }
  }

  async function runAITeamSSE() {
    if (!pipelineInput.trim() && !product?.prd) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const prompt = pipelineInput.trim() || `请分析产品：${product?.name}`;
    const roles = AGENT_ROLES.map(r => ({ role: r, status: "pending" as const }));
    setProgressData({ percent: 0, roles, summary: "", done: false, messages: [] });
    try {
      const res = await fetch("/api/pipeline/sse", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, inputPrompt: prompt }),
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
    } catch (err) { if ((err as Error).name !== "AbortError") { alert(`执行失败: ${(err as Error).message}`); setProgressData(null); } }
    finally { abortRef.current = null; }
  }

  function handleSSE(type: string, data: Record<string, unknown>) {
    setProgressData(prev => {
      if (!prev) return prev;
      const roles = [...prev.roles];
      switch (type) {
        case "role_start": { const i = roles.findIndex(r => r.role === data.role); if (i >= 0) roles[i] = { ...roles[i], status: "running" }; return { ...prev, roles, percent: data.progress as number || prev.percent }; }
        case "role_done": {
          const i = roles.findIndex(r => r.role === data.role);
          if (i >= 0) roles[i] = { ...roles[i], status: "done", summary: (data.content as string)?.substring(0, 60) };
          const msgs = [...prev.messages, { id: 0, pipeline_run_id: 0, agent_id: 0, role: data.role as string, content: data.content as string, structured_output: null, sequence: 0, created_at: new Date().toISOString() }];
          return { ...prev, roles, messages: msgs, percent: data.progress as number || prev.percent };
        }
        case "role_error": { const i = roles.findIndex(r => r.role === data.role); if (i >= 0) roles[i] = { ...roles[i], status: "error" }; return { ...prev, roles }; }
        case "summary": return { ...prev, summary: data.summary as string || prev.summary, percent: data.progress as number || prev.percent };
        case "complete": return { ...prev, percent: 100, summary: data.summary as string || prev.summary, done: true };
        case "done": loadData(); return prev;
        case "error": alert(`执行失败: ${data.message}`); return { ...prev, done: true };
        default: return prev;
      }
    });
  }

  if (loading) return <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}><div className="loading-spinner" /></div>;
  if (!product) return <div className="card empty-state">产品不存在</div>;

  const repoInfo = product.repo_url ? parseRepoUrl(product.repo_url) : null;

  return (
    <div>
      <a href="/products" style={{ color: "var(--text-muted)", fontSize: 12, textDecoration: "none", marginBottom: 16, display: "inline-block" }}>← 返回产品列表</a>

      <div className="card" style={{ marginBottom: 20 }}>
        {editMode ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <input className="input" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} placeholder="产品名称" />
            <textarea className="textarea" value={editForm.prd} onChange={e => setEditForm({ ...editForm, prd: e.target.value })} placeholder="PRD" rows={6} />
            <input className="input" value={editForm.repo_url} onChange={e => setEditForm({ ...editForm, repo_url: e.target.value })} placeholder="仓库 URL" />
            <select className="input" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
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
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <h1 style={{ fontSize: 20, fontWeight: 700 }}>{product.name}</h1>
                  <span className={`status-badge status-${product.status}`}>{STATUS_LABEL[product.status]}</span>
                  {product.repo_url ? (
                    <a href={product.repo_url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm" style={{ textDecoration: "none" }}>🔗 仓库</a>
                  ) : (
                    <button className="btn-secondary btn-sm" onClick={createRepo} disabled={creatingRepo}>
                      {creatingRepo ? "..." : "📦 创建仓库"}
                    </button>
                  )}
                </div>
                <div style={{ background: "var(--bg-primary)", borderRadius: 8, padding: 14, fontSize: 13, lineHeight: 1.7, color: "var(--text-secondary)", whiteSpace: "pre-wrap" }}>
                  {product.prd || "暂无PRD，可点击编辑添加或上传文档"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginLeft: 16, flexShrink: 0 }}>
                <button className="btn-secondary btn-sm" onClick={() => setEditMode(true)}>✏️ 编辑</button>
                <label className="btn-secondary btn-sm" style={{ cursor: uploading ? "wait" : "pointer" }}>
                  {uploading ? "上传中..." : "📎 上传文档"}
                  <input type="file" accept=".txt,.md,.docx" onChange={uploadDocument} style={{ display: "none" }} disabled={uploading} />
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">🤖 AI 团队</div>
        </div>
        <div className="grid-6">
          {agents.map(agent => {
            const meta = ROLE_META[agent.role as AgentRole];
            return (
              <div key={agent.id} style={{ background: "var(--bg-primary)", borderRadius: 10, padding: "12px 10px", border: "1px solid var(--border)", textAlign: "center" }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{meta?.emoji || "🤖"}</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{agent.name}</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>{agent.role}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center", marginBottom: 4 }}>
                  {(agent.skills || []).slice(0, 3).map((s, i) => (
                    <span key={i} className="tag tag-skill">{s}</span>
                  ))}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3, justifyContent: "center" }}>
                  {(agent.mcp_tools || []).map((mcp, i) => {
                    const mcpInfo = MCP_LABELS[mcp];
                    return mcpInfo ? <span key={i} className="tag tag-mcp">{mcpInfo.emoji} {mcpInfo.label}</span> : null;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">🧠 团队执行</div>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 12 }}>输入任务描述，AI团队将协作分析。执行完毕自动生成日报。</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input className="input" placeholder="分析用户积分系统的可行性..." value={pipelineInput}
            onChange={e => setPipelineInput(e.target.value)} onKeyDown={e => e.key === "Enter" && runAITeamSSE()} />
          <button className="btn-primary" onClick={runAITeamSSE} disabled={!!progressData && !progressData.done} style={{ whiteSpace: "nowrap" }}>
            🚀 执行
          </button>
          {progressData && !progressData.done && (
            <button className="btn-secondary btn-sm" onClick={() => { abortRef.current?.abort(); setProgressData(null); }}>取消</button>
          )}
        </div>

        {progressData && (
          <div>
            <div className="progress-bar" style={{ marginBottom: 8 }}>
              <div className={`progress-fill ${progressData.done ? "done" : ""}`} style={{ width: `${progressData.percent}%` }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>{progressData.done ? "✅ 完成" : `⏳ ${progressData.percent}%`}</div>

            <div className="grid-6" style={{ marginBottom: 16 }}>
              {progressData.roles.map(rp => {
                const meta = ROLE_META[rp.role as AgentRole] || { emoji: "🤖", name: rp.role };
                return (
                  <div key={rp.role} className={`role-card ${rp.status}`}>
                    <div className="role-emoji">{meta.emoji}</div>
                    <div className="role-name">{meta.name}</div>
                    <div className="role-status">{rp.status === "done" ? "✅" : rp.status === "running" ? "⏳" : rp.status === "error" ? "❌" : "⬜"}</div>
                  </div>
                );
              })}
            </div>

            {progressData.messages.length > 0 && progressData.messages.map((msg, idx) => {
              const meta = ROLE_META[msg.role as AgentRole];
              return (
                <div key={idx} className="message-bubble" style={{ borderLeft: `3px solid ${meta?.color || "#94a3b8"}` }}>
                  <span className="role-tag" style={{ background: meta?.color || "#94a3b8" }}>{meta?.emoji} {meta?.name || msg.role}</span>
                  <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 12, lineHeight: 1.7, margin: 0, color: "var(--text-primary)" }}>{msg.content}</pre>
                </div>
              );
            })}

            {progressData.summary && (
              <div style={{ marginTop: 12, padding: 12, background: "var(--bg-primary)", borderRadius: 8, borderLeft: "3px solid var(--accent)", fontSize: 12, lineHeight: 1.6 }}>
                <strong>📌 摘要：</strong>{progressData.summary}
              </div>
            )}
          </div>
        )}
      </div>

      {repoInfo && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">📁 代码仓库</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-secondary btn-sm" onClick={loadRepoContents}>{repoLoading ? "加载中..." : "🔄 刷新"}</button>
              <a href={product.repo_url!} target="_blank" rel="noreferrer" className="btn-secondary btn-sm" style={{ textDecoration: "none" }}>↗ GitHub</a>
            </div>
          </div>
          {repoError && <div style={{ color: "var(--danger)", fontSize: 12, marginBottom: 8 }}>{repoError}</div>}
          {repoBranches.length > 0 && (
            <div style={{ marginBottom: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "var(--text-muted)" }}>分支:</span>
              {repoBranches.map(b => <span key={b.name} className="tag" style={{ background: "var(--bg-primary)", border: "1px solid var(--border)" }}>{b.name}</span>)}
            </div>
          )}
          {repoFiles.length > 0 ? (
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: "0 0 220px", maxHeight: 350, overflowY: "auto", background: "var(--bg-primary)", borderRadius: 8, padding: 6 }}>
                {repoFiles.map(f => (
                  <div key={f.path} onClick={() => f.type === "file" && loadFileContents(f.path)} style={{
                    padding: "5px 8px", borderRadius: 4, cursor: f.type === "file" ? "pointer" : "default",
                    fontSize: 12, display: "flex", alignItems: "center", gap: 6,
                    background: selectedFile === f.path ? "var(--accent-glow)" : "transparent",
                    color: f.type === "file" ? "var(--text-primary)" : "var(--text-muted)",
                  }}>
                    <span>{f.type === "dir" ? "📁" : "📄"}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  </div>
                ))}
              </div>
              <div style={{ flex: 1, background: "var(--bg-primary)", borderRadius: 8, padding: 12, maxHeight: 350, overflowY: "auto" }}>
                {selectedFile ? (
                  <div>
                    <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 6, fontFamily: "monospace" }}>{selectedFile}</div>
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "Consolas, monospace", fontSize: 11, lineHeight: 1.5, color: "var(--text-primary)", margin: 0 }}>{fileContent || "加载中..."}</pre>
                  </div>
                ) : (
                  <div style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", paddingTop: 40 }}>点击左侧文件查看内容</div>
                )}
              </div>
            </div>
          ) : !repoLoading && (
            <div style={{ color: "var(--text-muted)", fontSize: 12, fontStyle: "italic" }}>点击「刷新」加载仓库文件</div>
          )}
        </div>
      )}
    </div>
  );
}
