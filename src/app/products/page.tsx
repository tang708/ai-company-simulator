"use client";

import { useEffect, useState } from "react";
import type { Product, ProductStatus, Agent } from "@/types";
import { STATUS_LABEL } from "@/types";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", prd: "", repo_url: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    try {
      const res = await fetch("/api/products");
      const json = await res.json();
      if (json.success) setProducts(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("产品名称不能为空"); return; }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.success) {
        setProducts([json.data, ...products]);
        setShowForm(false);
        setForm({ name: "", prd: "", repo_url: "" });
      } else {
        setError(json.error || "创建失败");
      }
    } catch (err) {
      setError("网络错误");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteProduct(id: number) {
    if (!confirm("确定要删除该产品吗？")) return;
    try {
      await fetch(`/api/products/${id}`, { method: "DELETE" });
      setProducts(products.filter((p) => p.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <div className="loading-spinner" />;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 className="text-2xl font-bold">📦 产品管理</h1>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "取消" : "+ 创建产品"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 24 }}>
          <form onSubmit={createProduct}>
            <h2 className="text-lg font-semibold mb-4">创建新产品</h2>
            {error && <div style={{ color: "var(--danger)", marginBottom: 12, fontSize: 13 }}>{error}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input className="input" placeholder="产品名称 *" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <textarea className="textarea" placeholder="PRD - 产品需求文档（可选）" value={form.prd}
                onChange={(e) => setForm({ ...form, prd: e.target.value })} />
              <input className="input" placeholder="代码仓库 URL（可选）" value={form.repo_url}
                onChange={(e) => setForm({ ...form, repo_url: e.target.value })} />
              <button className="btn-primary" type="submit" disabled={submitting} style={{ alignSelf: "flex-start" }}>
                {submitting ? "创建中..." : "确认创建（自动组建AI团队）"}
              </button>
            </div>
          </form>
        </div>
      )}

      {products.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "var(--text-secondary)", padding: 48 }}>
          暂无产品，点击「创建产品」开始。创建后自动组建6角色AI团队。
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {products.map((p) => (
            <div key={p.id} className="card"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                  <a href={`/products/${p.id}`} style={{
                    fontSize: 16, fontWeight: 600, color: "var(--text-primary)", textDecoration: "none"
                  }}>
                    {p.name}
                  </a>
                  <span className={`status-badge status-${p.status}`}>{STATUS_LABEL[p.status]}</span>
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                  {p.prd ? p.prd.substring(0, 80) + (p.prd.length > 80 ? "..." : "") : "暂无PRD"}
                  {p.repo_url && (
                    <span> · <a href={p.repo_url} target="_blank" rel="noreferrer"
                      style={{ color: "var(--accent)" }}>📎 仓库</a></span>
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <a href={`/products/${p.id}`} className="btn-secondary" style={{ textDecoration: "none" }}>详情</a>
                <button className="btn-secondary" onClick={() => deleteProduct(p.id)}
                  style={{ color: "var(--danger)" }}>删除</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
