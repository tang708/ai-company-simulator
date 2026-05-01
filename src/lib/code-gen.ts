import { chatCompletion } from "@/lib/deepseek";
import type { PipelineMessage } from "@/types";

interface GeneratedFile {
  path: string;
  content: string;
  description: string;
}

interface GeneratedCode {
  files: GeneratedFile[];
  setupCommands: string[];
  repoDescription: string;
  totalLines: number;
}

export async function generateCodeFromDevOutput(
  productName: string,
  devMessage: PipelineMessage,
  techMessage?: PipelineMessage,
  pmMessage?: PipelineMessage
): Promise<GeneratedCode> {
  const techSummary = techMessage ? techMessage.content.substring(0, 1000) : "";
  const pmSummary = pmMessage ? pmMessage.content.substring(0, 800) : "";

  const prompt = `## 产品名称
${productName}

## 产品经理分析
${pmSummary}

## 技术负责人架构
${techSummary}

## 开发工程师实现方案
${devMessage.content.substring(0, 3000)}

请基于以上分析，为该项目生成初始代码仓库的文件列表和内容。
必须输出有效的 JSON，格式如下：
{
  "files": [
    {
      "path": "相对路径/文件名",
      "content": "文件完整内容",
      "description": "文件用途"
    }
  ],
  "setupCommands": ["安装命令"],
  "repoDescription": "仓库描述（50字以内）",
  "totalLines": 0
}

要求：
1. 生成 3-8 个核心源文件（如 package.json、主入口、核心模块、测试文件、README）
2. 代码要实际可用，不是伪代码
3. 确保 package.json 包含合理依赖
4. README.md 包含项目说明和启动方式
5. 输出有效 JSON，content 中引号用转义`;

  let result = "";
  try {
    result = await chatCompletion(
      "你是一个资深全栈开发工程师，请根据技术方案生成实际可用的项目代码。务必输出完整有效的JSON。",
      prompt,
      { temperature: 0.3, maxTokens: 8000 }
    );
  } catch (err) {
    throw new Error(`代码生成失败: ${err instanceof Error ? err.message : "未知错误"}`);
  }

  const jsonMatch = result.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return buildFallbackCode(productName);

  try {
    const parsed = JSON.parse(jsonMatch[0]) as GeneratedCode;
    return {
      files: parsed.files || [],
      setupCommands: parsed.setupCommands || [],
      repoDescription: parsed.repoDescription || `${productName} 项目代码`,
      totalLines: parsed.files?.reduce((sum: number, f: GeneratedFile) => sum + (f.content?.split("\n").length || 0), 0) || 0,
    };
  } catch {
    return buildFallbackCode(productName);
  }
}

function buildFallbackCode(productName: string): GeneratedCode {
  const slug = productName.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return {
    files: [
      {
        path: "README.md",
        content: `# ${productName}\n\nAI 生成的初始化项目。\n\n## 启动\n\`\`\`bash\nnpm install\nnpm start\n\`\`\``,
        description: "项目说明文档",
      },
      {
        path: "package.json",
        content: JSON.stringify({ name: slug, version: "1.0.0", description: productName, main: "src/index.js", scripts: { start: "node src/index.js", test: "node --test" } }, null, 2),
        description: "项目配置文件",
      },
      {
        path: "src/index.js",
        content: `// ${productName} - AI Generated\nconsole.log("${productName} started");\n`,
        description: "主入口文件",
      },
    ],
    setupCommands: ["npm install", "npm start"],
    repoDescription: `${productName} 项目代码`,
    totalLines: 10,
  };
}

export function getCommitMessage(devOutput: string): string {
  const summary = devOutput.substring(0, 80);
  return `🤖 AI Dev: ${summary}${devOutput.length > 80 ? "..." : ""}`;
}
