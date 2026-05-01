import { query, execute } from "@/lib/db";

const MAX_HISTORY = 20;

export interface ProductMemory {
  id: number; product_id: number; mem_key: string; mem_value: string; updated_at: string;
}

export async function setMemory(productId: number, key: string, value: string): Promise<void> {
  await execute(
    "INSERT INTO product_memory (product_id, mem_key, mem_value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mem_value = ?, updated_at = NOW()",
    [productId, key, value, value]
  );
}

export async function getMemory(productId: number, key: string): Promise<string | null> {
  const rows = await query<{ mem_value: string }>(
    "SELECT mem_value FROM product_memory WHERE product_id = ? AND mem_key = ?", [productId, key]
  );
  return rows.length > 0 ? rows[0].mem_value : null;
}

export async function getAllMemories(productId: number): Promise<ProductMemory[]> {
  return query(
    "SELECT id, product_id, mem_key, mem_value, updated_at FROM product_memory WHERE product_id = ? ORDER BY updated_at DESC LIMIT ?",
    [productId, MAX_HISTORY]
  );
}

export async function buildMemoryContext(productId: number): Promise<string> {
  const [productRows, memoryRows, taskRows, latestReport] = await Promise.all([
    query<{ name: string; prd: string; status: string; repo_url: string }>(
      "SELECT name, prd, status, repo_url FROM products WHERE id = ?", [productId]
    ),
    getAllMemories(productId),
    query<{ title: string; status: string }>(
      "SELECT title, status FROM tasks WHERE product_id = ? ORDER BY updated_at DESC LIMIT 5", [productId]
    ),
    query<{ summary: string; created_at: string }>(
      "SELECT summary, created_at FROM team_reports WHERE product_id = ? ORDER BY created_at DESC LIMIT 1", [productId]
    ),
  ]);

  let ctx = "";
  if (productRows.length > 0) {
    const p = productRows[0];
    ctx += `## 产品: ${p.name} (${p.status})\nPRD: ${p.prd || "无"}\n\n`;
  }
  if (latestReport.length > 0) {
    ctx += `## 最新团队报告 (${latestReport[0].created_at})\n${latestReport[0].summary || "无"}\n\n`;
  }
  if (taskRows.length > 0) {
    ctx += `## 最近任务\n${taskRows.map(t => `- ${t.title} [${t.status}]`).join("\n")}\n\n`;
  }
  if (memoryRows.length > 0) {
    ctx += `## 历史记录\n${memoryRows.map(m => `- ${m.mem_key}: ${m.mem_value?.substring(0,200)}`).join("\n")}\n\n`;
  }
  return ctx;
}

export async function recordAnalysis(productId: number, role: string, summary: string): Promise<void> {
  await setMemory(productId, `${role}_last_analysis`, summary);
  await setMemory(productId, `last_updated`, new Date().toISOString());
}
