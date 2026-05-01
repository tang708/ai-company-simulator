const GITHUB_API = "https://api.github.com";

function getToken(): string {
  const token = process.env.GITHUB_TOKEN || "";
  if (!token || token === "ghp_your_token_here" || token.length < 30) {
    throw new Error("GitHub Token 未配置或无效。请在 .env.local 中设置 GITHUB_TOKEN");
  }
  return token;
}

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${getToken()}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function org(): string {
  return process.env.GITHUB_ORG || "";
}

async function validateAndGetOrg(): Promise<string> {
  const o = org();
  if (!o) return "";

  try {
    const res = await fetch(`${GITHUB_API}/user`, { headers: { ...headers(), Accept: "application/vnd.github+json" } });
    const user = await res.json() as { login: string };

    if (o.toLowerCase() === (user.login || "").toLowerCase()) {
      console.log(`[GitHub] GITHUB_ORG "${o}" 是用户名而非组织，将使用个人账户创建仓库。请将 GITHUB_ORG 设为你的组织名或留空。`);
      return "";
    }
  } catch { /* ignore */ }

  // 验证 org 存在
  try {
    const res = await fetch(`${GITHUB_API}/orgs/${o}`, { headers: headers() });
    if (res.status === 404) {
      console.log(`[GitHub] 组织 "${o}" 不存在(404)，将使用个人账户创建仓库。`);
      return "";
    }
  } catch { return ""; }

  return o;
}

async function ghFetch(method: string, path: string, body?: Record<string, unknown>) {
    const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
    const opts: RequestInit = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const json = await res.json();
    if (!res.ok) {
      const msg = (json as Record<string,unknown>).message || "";
      const errors = (json as Record<string,unknown>).errors as Array<{message:string;resource:string;field:string;code:string}> | undefined;
      const errDetail = errors?.map(e => `${e.field||""}: ${e.message}`).join("; ") || "";
      const fullMsg = [msg, errDetail].filter(Boolean).join(" | ");
      if (res.status === 404) throw new Error(`GitHub 404: ${fullMsg || "资源不存在"} (${path})`);
      throw new Error(`GitHub ${res.status}: ${fullMsg || "未知错误"}`);
    }
    return json;
  }

export interface GitHubRepo {
  id: number; name: string; full_name: string; html_url: string;
  description: string | null; private: boolean; default_branch: string;
  created_at: string; pushed_at: string; language: string | null;
}

export interface GitHubFile {
  name: string; path: string; type: "file" | "dir"; size: number;
  sha?: string; content?: string; html_url?: string;
}

export interface GitHubBranch { name: string; protected: boolean; sha: string; }

export async function createRepo(name: string, description: string, isPrivate = false): Promise<GitHubRepo> {
  const o = await validateAndGetOrg();
  const slug = sanitizeRepoName(name);
  const cleanDesc = description
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const body: Record<string, unknown> = {
    name: slug,
    description: cleanDesc.substring(0, 200),
    private: isPrivate,
    auto_init: true,
  };

  const path = o ? `/orgs/${o}/repos` : "/user/repos";

  try {
    return await ghFetch("POST", path, body) as Promise<GitHubRepo>;
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("not accessible") || msg.includes("403")) {
      throw new Error(
        "GitHub 权限不足：当前 Token 无法创建仓库。\n\n" +
        "请确保 Token 具有以下权限：\n" +
        "1. Repository: Administration (Read and write)\n" +
        "2. Repository: Contents (Read and write)\n" +
        "3. 选择 All repositories" +
        (o ? `\n4. 组织 ${o} 的 Members 权限` : "") +
        "\n\n或者创建 Classic Token（勾选 repo 全部权限）会更简单。"
      );
    }
    if (msg.includes("422") || msg.includes("name already exists")) {
      const retrySlug = slug + "-" + Date.now().toString(36);
      body.name = retrySlug.substring(0, 100);
      return await ghFetch("POST", path, body) as Promise<GitHubRepo>;
    }
    throw err;
  }
}

function sanitizeRepoName(name: string): string {
  const cleaned = name
    .replace(/[\s]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  if (cleaned.length >= 3) return cleaned.substring(0, 100);

  const pinyin = name
    .split("")
    .filter((c) => /[a-zA-Z0-9]/.test(c))
    .join("")
    .toLowerCase();

  if (pinyin.length >= 3) return pinyin.substring(0, 100);

  return "ai-product-" + Date.now().toString(36);
}

export async function getRepo(owner: string, repo: string): Promise<GitHubRepo> {
  return ghFetch("GET", `/repos/${owner}/${repo}`) as Promise<GitHubRepo>;
}

export async function listUserRepos(): Promise<GitHubRepo[]> {
  return ghFetch("GET", "/user/repos?sort=updated&per_page=20") as Promise<GitHubRepo[]>;
}

export async function getFileContents(owner: string, repo: string, filePath: string): Promise<GitHubFile> {
  const data = await ghFetch("GET", `/repos/${owner}/${repo}/contents/${filePath}`) as GitHubFile;
  if (data.content) data.content = Buffer.from(data.content, "base64").toString("utf-8");
  return data;
}

export async function listRepoContents(owner: string, repo: string, dirPath = ""): Promise<GitHubFile[]> {
  const p = dirPath ? `/repos/${owner}/${repo}/contents/${dirPath}` : `/repos/${owner}/${repo}/contents`;
  return ghFetch("GET", p) as Promise<GitHubFile[]>;
}

export async function createOrUpdateFile(
  owner: string, repo: string, filePath: string,
  content: string, message: string, branch = "main"
): Promise<{ sha: string; html_url: string }> {
  const contentB64 = Buffer.from(content, "utf-8").toString("base64");
  let sha = "";
  try {
    const existing = await getFileContents(owner, repo, filePath);
    sha = existing.sha || "";
  } catch { /* file doesn't exist, ok */ }

  const body: Record<string, unknown> = { message, content: contentB64, branch };
  if (sha) body.sha = sha;
  return ghFetch("PUT", `/repos/${owner}/${repo}/contents/${filePath}`, body) as Promise<{ sha: string; html_url: string }>;
}

export async function pushMultipleFiles(
  owner: string, repo: string, branch: string,
  files: { path: string; content: string }[], message: string
) {
  return ghFetch("PUT", `/repos/${owner}/${repo}/contents/bulk`, { branch, files, message }).catch(async () => {
    // Fallback: push one by one
    for (const f of files) {
      await createOrUpdateFile(owner, repo, f.path, f.content, message, branch);
    }
    return { pushed: files.length };
  });
}

export async function listBranches(owner: string, repo: string): Promise<GitHubBranch[]> {
  return ghFetch("GET", `/repos/${owner}/${repo}/branches`) as Promise<GitHubBranch[]>;
}

export async function createBranch(owner: string, repo: string, branchName: string, fromBranch = "main") {
  const main = await ghFetch("GET", `/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`) as { object: { sha: string } };
  return ghFetch("POST", `/repos/${owner}/${repo}/git/refs`, {
    ref: `refs/heads/${branchName}`,
    sha: main.object.sha,
  });
}

export async function createPR(
  owner: string, repo: string, title: string, head: string, base = "main", body = ""
) {
  return ghFetch("POST", `/repos/${owner}/${repo}/pulls`, { title, head, base, body });
}

export async function triggerWorkflowDispatch(owner: string, repo: string, workflowId: string, ref = "main") {
  return ghFetch("POST", `/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, { ref });
}

export function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/\s?#.]+)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2] };
}

export function buildRepoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}
