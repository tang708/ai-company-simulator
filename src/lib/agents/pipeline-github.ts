import { queryOne, execute } from "@/lib/db";
import {
  createRepo, createOrUpdateFile, parseRepoUrl, createBranch, createPR, buildRepoUrl,
} from "@/lib/github";
import { generateCodeFromDevOutput, getCommitMessage } from "@/lib/code-gen";
import type { PipelineMessage } from "@/types";
import { runPipelineWithProgress, type PipelineProgressCallback } from "./pipeline";

export interface GitHubPipelineResult {
  repoUrl: string;
  repoName: string;
  branchName: string;
  filesCreated: string[];
  commitMessage: string;
  pullRequestUrl?: string;
}

export async function runPipelineWithGitHub(
  productId: number,
  inputPrompt: string,
  onProgress?: PipelineProgressCallback
): Promise<{
  run: import("@/types").PipelineRun;
  messages: PipelineMessage[];
  github?: GitHubPipelineResult;
}> {
  const product = await queryOne<{ name: string; prd: string; repo_url: string; status: string }>(
    "SELECT name, prd, repo_url, status FROM products WHERE id = ?", [productId]
  );
  if (!product) throw new Error(`产品 ${productId} 不存在`);

  const result = await runPipelineWithProgress(productId, inputPrompt, "manual", onProgress);
  const messages = result.messages;

  const devMsg = messages.find((m) => m.role === "Dev" && !m.content.startsWith("[失败]"));
  const techMsg = messages.find((m) => m.role === "TechLead" && !m.content.startsWith("[失败]"));
  const pmMsg = messages.find((m) => m.role === "PM" && !m.content.startsWith("[失败]"));

  if (!devMsg) {
    return { run: result.run, messages };
  }

  // GitHub 集成
  let repoUrl = product.repo_url;
  let owner = "";
  let repoName = "";
  let branchName = "main";
  const filesCreated: string[] = [];
  let prUrl: string | undefined;

  try {
    // 步骤1: 没有仓库则自动创建
    if (!repoUrl || !parseRepoUrl(repoUrl)) {
      onProgress?.({ type: "summary", progress: 96, summary: "📦 创建 GitHub 仓库..." });

      const repoDesc = `${product.name} - AI驱动的项目代码`;
      const repoData = await createRepo(
        product.name.replace(/\s+/g, "-"),
        repoDesc,
        false
      );

      repoUrl = repoData.html_url;
      owner = repoData.full_name.split("/")[0];
      repoName = repoData.name;
      branchName = repoData.default_branch || "main";

      await execute("UPDATE products SET repo_url = ? WHERE id = ?", [repoUrl, productId]);
      onProgress?.({ type: "summary", progress: 97, summary: `✅ 仓库已创建: ${repoUrl}` });
    }

    const parsed = parseRepoUrl(repoUrl);
    if (!parsed) return { run: result.run, messages };

    owner = parsed.owner;
    repoName = parsed.repo;

    // 处理已有仓库但 owner 为空
    if (!owner) {
      const repoData = await queryOne<{ repo_url: string }>("SELECT repo_url FROM products WHERE id = ?", [productId]);
      if (repoData?.repo_url) {
        const p = parseRepoUrl(repoData.repo_url);
        if (p) { owner = p.owner; repoName = p.repo; }
      }
    }

    // 步骤2: Dev 角色分析结果 → 生成代码 → 提交
    onProgress?.({ type: "summary", progress: 97, summary: "🤖 AI 生成代码中..." });

    const generated = await generateCodeFromDevOutput(product.name, devMsg, techMsg, pmMsg);

    // 步骤3: 创建 feature 分支
    branchName = `ai/dev-${Date.now()}`;
    try {
      await createBranch(owner, repoName, branchName, "main");
    } catch {
      branchName = "main";
    }

    // 步骤4: 推送所有文件
    const commitMsg = getCommitMessage(devMsg.content);
    for (const file of generated.files) {
      try {
        await createOrUpdateFile(owner, repoName, file.path, file.content, commitMsg, branchName);
        filesCreated.push(file.path);
      } catch (err) {
        onProgress?.({ type: "role_error", role: "Dev", error: `文件 ${file.path} 推送失败: ${err instanceof Error ? err.message : ""}` });
      }
    }

    // 步骤5: 创建 PR（如果用了 feature 分支）
    if (branchName !== "main" && filesCreated.length > 0) {
      try {
        const prData = await createPR(
          owner, repoName,
          `🤖 AI-generated: ${product.name} 初始化代码`,
          branchName,
          "main",
          `## AI 生成代码\n\n基于以下分析：\n- 产品经理分析\n- 技术架构评估\n- 开发实现方案\n\n### 生成文件\n${filesCreated.map((f) => `- ${f}`).join("\n")}\n\n### 总计\n${generated.totalLines} 行代码`
        ) as { html_url: string };
        prUrl = prData.html_url;
      } catch { /* PR 创建失败不阻塞 */ }
    }

    onProgress?.({ type: "summary", progress: 99, summary: `✅ 代码已推送 (${filesCreated.length} 文件, ${generated.totalLines} 行)` });

  } catch (err) {
    onProgress?.({ type: "role_error", role: "Dev", error: `GitHub集成失败: ${err instanceof Error ? err.message : "未知"}` });
  }

  const githubResult: GitHubPipelineResult = {
    repoUrl: repoUrl || "",
    repoName,
    branchName,
    filesCreated,
    commitMessage: getCommitMessage(devMsg?.content || ""),
    pullRequestUrl: prUrl,
  };

  return { run: result.run, messages, github: filesCreated.length > 0 ? githubResult : undefined };
}
