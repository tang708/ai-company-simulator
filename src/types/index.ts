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
  output_format: string;
  model: string;
  temperature: number;
  created_at: string;
}

export type AgentRole = "PM" | "TechLead" | "Dev" | "QA" | "Ops" | "Data";

export const AGENT_ROLES: AgentRole[] = ["PM", "TechLead", "Dev", "QA", "Ops", "Data"];

export const ROLE_ORDER: Record<AgentRole, number> = {
  PM: 1, TechLead: 2, Dev: 3, QA: 4, Ops: 5, Data: 6,
};

export type ProductStatus = "idea" | "dev" | "online";

export const STATUS_LABEL: Record<ProductStatus, string> = {
  idea: "构思中", dev: "开发中", online: "已上线",
};

export interface TeamMember {
  id: number;
  product_id: number;
  agent_id: number;
  is_active: boolean;
  created_at: string;
  agent?: Agent;
}

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

export interface CreateProductInput {
  name: string;
  prd?: string;
  repo_url?: string;
}

export interface UpdateProductInput {
  name?: string;
  prd?: string;
  repo_url?: string;
  status?: ProductStatus;
}

export interface StructuredAgentOutput {
  summary: string;
  [key: string]: unknown;
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
