# AI 项目管理平台

> **GitHub**: https://github.com/tang708/ai-company-simulator

基于 Next.js 的 AI Agent 产品管理操作系统，实现 AI 驱动的项目协作、日报生成和团队管理。

## 技术栈

- **前端**: Next.js 16 + React + TypeScript + Tailwind CSS
- **AI**: DeepSeek API（对话、代码生成、报告撰写）
- **数据库**: MySQL 8.0（mysql2 连接池）
- **集成**: GitHub API（仓库管理、代码生成）

## 功能

- **产品管理**: AI 产品从概念到上线的全流程管理
- **日报生成**: AI 自动生成每日工作报告
- **团队报告**: 团队协作分析与报告
- **代码生成**: AI 辅助代码生成（GitHub 集成）
- **Agent Pipeline**: 多 Agent 流水线编排引擎
- **执行日志**: Agent 执行过程可视化与回放

## 快速开始

```bash
npm install
# 配置 .env.local: DEEPSEEK_API_KEY, GITHUB_TOKEN, DB_PASSWORD 等
npm run dev
```

访问 `http://localhost:3000`

## 项目结构

```
├── src/
│   ├── app/              # Next.js App Router 页面
│   │   ├── api/           # API 路由（日报、报告、Pipeline SSE）
│   │   ├── products/      # 产品管理页
│   │   └── team-reports/  # 团队报告页
│   └── lib/
│       ├── deepseek.ts    # DeepSeek API 封装
│       ├── github.ts      # GitHub API 封装
│       ├── db.ts          # 数据库连接
│       ├── code-gen.ts    # AI 代码生成
│       └── agents/        # Agent 引擎核心
│           ├── engine.ts  # Agent 执行引擎
│           └── pipeline.ts # 多 Agent 流水线
```
