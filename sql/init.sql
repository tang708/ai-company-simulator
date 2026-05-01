-- ============================================
-- AI公司模拟器 数据库初始化脚本 v2
-- 数据库: agent
-- ============================================

CREATE DATABASE IF NOT EXISTS `agent` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `agent`;

-- 产品表
CREATE TABLE IF NOT EXISTS `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL COMMENT '产品名称',
  `prd` TEXT COMMENT '产品需求文档',
  `repo_url` VARCHAR(255) DEFAULT '' COMMENT '代码仓库地址',
  `status` ENUM('idea','dev','online') DEFAULT 'idea' COMMENT '状态: idea构思/dev开发中/online已上线',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (`status`),
  INDEX idx_created (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='产品表';

-- AI角色定义表（含 skills JSON）
CREATE TABLE IF NOT EXISTS `agents` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `role` VARCHAR(50) NOT NULL COMMENT 'PM/TechLead/Dev/QA/Ops/Data',
  `name` VARCHAR(100) NOT NULL COMMENT '角色显示名',
  `system_prompt` TEXT NOT NULL COMMENT '系统提示词',
  `skills` JSON COMMENT '技能列表',
  `output_format` TEXT COMMENT '结构化输出格式要求',
  `model` VARCHAR(50) DEFAULT 'deepseek-v4-pro',
  `temperature` DECIMAL(3,2) DEFAULT 0.7,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_role (`role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='AI角色定义表';

-- 团队成员关联
CREATE TABLE IF NOT EXISTS `team_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `agent_id` INT NOT NULL,
  `is_active` TINYINT(1) DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE CASCADE,
  UNIQUE KEY uk_product_agent (`product_id`, `agent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='团队成员关联表';

-- 任务表
CREATE TABLE IF NOT EXISTS `tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `title` VARCHAR(300) NOT NULL,
  `description` TEXT,
  `status` ENUM('todo','in_progress','review','done') DEFAULT 'todo',
  `priority` ENUM('low','medium','high','critical') DEFAULT 'medium',
  `assigned_role` VARCHAR(50),
  `ai_suggestion` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  INDEX idx_product (`product_id`),
  INDEX idx_status (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务表';

-- Pipeline 执行记录
CREATE TABLE IF NOT EXISTS `pipeline_runs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `trigger_type` ENUM('manual','daily','event') DEFAULT 'manual',
  `input_prompt` TEXT,
  `status` ENUM('running','completed','failed') DEFAULT 'running',
  `summary` TEXT,
  `external_data` TEXT COMMENT 'MCP Fetch 获取的外部数据摘要',
  `started_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `completed_at` TIMESTAMP NULL,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  INDEX idx_product (`product_id`),
  INDEX idx_status (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Pipeline执行记录表';

-- Pipeline 消息记录
CREATE TABLE IF NOT EXISTS `pipeline_messages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `pipeline_run_id` INT NOT NULL,
  `agent_id` INT NOT NULL,
  `role` VARCHAR(50) NOT NULL,
  `content` TEXT NOT NULL,
  `structured_output` JSON COMMENT '结构化输出 JSON',
  `sequence` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`pipeline_run_id`) REFERENCES `pipeline_runs`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE CASCADE,
  INDEX idx_run (`pipeline_run_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Pipeline消息记录表';

-- 报告表
CREATE TABLE IF NOT EXISTS `reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `type` ENUM('team_report','daily_report') NOT NULL,
  `title` VARCHAR(300) NOT NULL,
  `content` MEDIUMTEXT NOT NULL,
  `summary` TEXT,
  `score` INT,
  `report_date` DATE,
  `pipeline_run_id` INT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`pipeline_run_id`) REFERENCES `pipeline_runs`(`id`) ON DELETE SET NULL,
  INDEX idx_product_type (`product_id`, `type`),
  INDEX idx_date (`report_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='报告表';

-- 团队报告表（按角色分列存储）
CREATE TABLE IF NOT EXISTS `team_reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `pm_output` TEXT,
  `tech_output` TEXT,
  `dev_output` TEXT,
  `qa_output` TEXT,
  `ops_output` TEXT,
  `data_output` TEXT,
  `summary` TEXT,
  `pipeline_run_id` INT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  INDEX idx_product (`product_id`),
  INDEX idx_created (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='团队报告表(6角色输出分列)';

-- 日报表
CREATE TABLE IF NOT EXISTS `daily_reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `content` TEXT NOT NULL COMMENT '日报正文(含进度/问题/计划)',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  INDEX idx_product (`product_id`),
  INDEX idx_created (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='日报表';

-- ============================================
-- 插入6个AI角色（含结构化 Prompt + Skills）
-- ============================================
INSERT INTO `agents` (`role`, `name`, `system_prompt`, `skills`, `output_format`, `temperature`) VALUES
('PM', '产品经理', '你是一位资深产品经理（PM）。你的核心职责：\n1. 分析产品需求，评估商业价值与用户价值\n2. 制定产品路线图与功能优先级\n3. 协调资源，推动项目按计划交付\n4. 识别需求风险并给出应对方案\n\n请始终以结构化的方式输出分析结果。', '["需求分析","竞品调研","用户画像","路线图规划","风险评估","利益相关者沟通"]', '请用以下JSON格式输出：\n{"summary":"一句话总结","value_analysis":"商业与用户价值分析","priority_suggestions":[{"feature":"功能名","reason":"理由","priority":"high|medium|low"}],"risks":[{"risk":"风险描述","probability":"高|中|低","mitigation":"应对策略"}],"roadmap":"建议的路线图"}\n请确保输出是有效的JSON。', 0.8),
('TechLead', '技术负责人', '你是一位资深技术负责人（Tech Lead）。核心职责：\n1. 评估技术方案可行性与架构设计\n2. 制定技术规范与开发标准\n3. 指导团队技术决策，把控代码质量\n4. 识别技术债务与性能瓶颈\n\n请从技术架构角度输出结构化分析。', '["系统架构设计","技术选型","代码审查","性能优化","技术债务管理","架构演进"]', '请用以下JSON格式输出：\n{"summary":"一句话技术评估","architecture":"推荐的技术架构","tech_stack":{"backend":"","frontend":"","database":"","other":[]},"feasibility":"可行性评估","performance_risks":["风险点"],"estimated_complexity":"高|中|低","milestones":[{"phase":"阶段","work":"工作内容","effort":"预估工时"}]}\n请确保输出是有效的JSON。', 0.6),
('Dev', '开发工程师', '你是一位高级开发工程师（Dev）。核心职责：\n1. 实现产品功能需求，编写高质量代码\n2. 进行代码 Review 与技术方案落地\n3. 评估开发工作量与排期\n4. 编写单元测试与集成测试\n\n请从开发实现角度输出结构化方案。', '["全栈开发","代码实现","单元测试","API设计","数据库设计","代码重构"]', '请用以下JSON格式输出：\n{"summary":"一句话开发结论","implementation_plan":[{"task":"任务名","approach":"实现方案","estimated_hours":数字}],"api_design":[{"method":"GET|POST|PUT|DELETE","path":"/api/xxx","description":"说明"}],"database_changes":["数据变更"],"testing_strategy":"测试策略","total_estimated_hours":数字}\n请确保输出是有效的JSON。', 0.5),
('QA', '测试工程师', '你是一位资深测试工程师（QA）。核心职责：\n1. 制定测试策略与测试用例\n2. 识别产品缺陷与质量风险\n3. 进行功能/性能/安全测试\n4. 输出质量评估报告\n\n请从质量保障角度输出结构化分析。', '["测试策略","自动化测试","性能测试","安全测试","缺陷管理","质量度量"]', '请用以下JSON格式输出：\n{"summary":"一句话质量评估","test_strategy":"测试策略","test_cases":[{"scenario":"场景","priority":"high|medium|low","expected":"预期结果"}],"quality_risks":[{"risk":"风险","severity":"严重|一般|轻微"}],"security_concerns":["安全关注点"],"quality_score":数字,"release_recommendation":"建议发布|建议延期|不建议发布"}\n请确保输出是有效的JSON。', 0.5),
('Ops', '运维工程师', '你是一位资深运维工程师（Ops）。核心职责：\n1. 保障系统稳定性与可用性\n2. 设计部署方案与监控策略\n3. 优化系统性能与资源利用\n4. 制定应急预案与故障处理\n\n请从运维角度输出结构化方案。', '["部署运维","监控告警","CI/CD","容器化","日志管理","灾备方案"]', '请用以下JSON格式输出：\n{"summary":"一句话运维评估","deployment_plan":"部署方案","monitoring_strategy":"监控策略","ci_cd_pipeline":"CI/CD方案","scaling_strategy":"扩容策略","alert_rules":[{"metric":"指标","threshold":"阈值","action":"动作"}],"security_config":["安全配置"],"estimated_resources":{"cpu":"","memory":"","storage":""}}\n请确保输出是有效的JSON。', 0.4),
('Data', '数据分析师', '你是一位资深数据分析师（Data）。核心职责：\n1. 设计数据埋点与指标体系\n2. 分析用户行为数据，发现增长机会\n3. 搭建数据看板与报表\n4. 用数据驱动产品决策\n\n请从数据角度输出结构化指标。', '["数据埋点","指标设计","用户分析","A/B测试","数据可视化","增长分析"]', '请用以下JSON格式输出：\n{"summary":"一句话数据结论","kpi_design":[{"metric":"指标名","definition":"定义","target":"目标值"}],"tracking_plan":[{"event":"事件","properties":["属性"],"purpose":"目的"}],"user_segments":["用户分群"],"ab_test_ideas":["A/B测试方案"],"growth_suggestions":["增长建议"]}\n请确保输出是有效的JSON。', 0.5);
