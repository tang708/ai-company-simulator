export interface Product {
  id: number;
  name: string;
  prd: string | null;
  repo_url: string | null;
  status: "idea" | "dev" | "online";
  created_at: string;
}

export interface Agent {
  id: number;
  role: AgentRole;
  name: string;
  system_prompt: string;
  skills: string[];
  mcp_tools: string[];
  output_format: string;
  model: string;
  temperature: number;
  created_at: string;
}

export type AgentRole = "PM" | "TechLead" | "Dev" | "QA" | "Ops" | "Data";

export const AGENT_ROLES: AgentRole[] = ["PM", "TechLead", "Dev", "QA", "Ops", "Data"];

export const ROLE_META: Record<AgentRole, { emoji: string; color: string; name: string; mcpLabel: string }> = {
  PM: { emoji: "📊", color: "#6366f1", name: "产品经理", mcpLabel: "Web Fetch" },
  TechLead: { emoji: "💻", color: "#3b82f6", name: "技术负责人", mcpLabel: "Web Fetch + GitHub" },
  Dev: { emoji: "⚙️", color: "#f59e0b", name: "开发工程师", mcpLabel: "GitHub + Code Gen" },
  QA: { emoji: "🔍", color: "#22c55e", name: "测试工程师", mcpLabel: "Web Fetch" },
  Ops: { emoji: "🛡️", color: "#ef4444", name: "运维工程师", mcpLabel: "GitHub + Web Fetch" },
  Data: { emoji: "📈", color: "#8b5cf6", name: "数据分析师", mcpLabel: "Web Fetch" },
};

export const MCP_LABELS: Record<string, { emoji: string; label: string; color: string }> = {
  web_fetch: { emoji: "🌐", label: "Web Fetch", color: "#3b82f6" },
  github: { emoji: "🐙", label: "GitHub", color: "#6e5494" },
  code_gen: { emoji: "🔧", label: "Code Gen", color: "#f59e0b" },
};

export type ProductStatus = "idea" | "dev" | "online";

export const STATUS_LABEL: Record<ProductStatus, string> = {
  idea: "构思中", dev: "开发中", online: "已上线",
};

export interface Task {
  id: number;
  product_id: number;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "review" | "done";
  priority: "low" | "medium" | "high" | "critical";
  assigned_role: AgentRole | null;
  ai_suggestion: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineRun {
  id: number;
  product_id: number;
  trigger_type: "manual" | "daily" | "event";
  input_prompt: string | null;
  status: "running" | "completed" | "failed";
  summary: string | null;
  external_data: string | null;
  progress: number;
  current_role: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface PipelineMessage {
  id: number;
  pipeline_run_id: number;
  agent_id: number;
  role: string;
  content: string;
  structured_output: string | null;
  sequence: number;
  created_at: string;
}

export interface TeamReport {
  id: number;
  product_id: number;
  pm_output: string | null;
  tech_output: string | null;
  dev_output: string | null;
  qa_output: string | null;
  ops_output: string | null;
  data_output: string | null;
  summary: string | null;
  pipeline_run_id: number | null;
  created_at: string;
}

export interface DailyReport {
  id: number;
  product_id: number;
  content: string;
  created_at: string;
}

export interface Report {
  id: number;
  product_id: number;
  type: "team_report" | "daily_report";
  title: string;
  content: string;
  summary: string | null;
  score: number | null;
  report_date: string | null;
  pipeline_run_id: number | null;
  created_at: string;
}

export interface GitHubRepoInfo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  default_branch: string;
  created_at: string;
  pushed_at: string;
  language: string | null;
}

export interface GitHubFileInfo {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number;
  sha?: string;
  content?: string;
}

export interface GitHubBranchInfo {
  name: string;
  protected: boolean;
  sha: string;
}
