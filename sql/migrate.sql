-- ============================================
-- 数据库迁移脚本：旧表 → 新表结构
-- 在 MySQL 中执行此脚本
-- ============================================
USE `agent`;

-- 1. 新增 prd / repo_url 列，修改 status 枚举
ALTER TABLE `products`
  ADD COLUMN `prd` TEXT COMMENT '产品需求文档' AFTER `name`,
  ADD COLUMN `repo_url` VARCHAR(255) DEFAULT '' COMMENT '代码仓库地址' AFTER `prd`,
  MODIFY COLUMN `status` ENUM('idea','dev','online') DEFAULT 'idea' COMMENT '状态',
  DROP COLUMN `description`,
  DROP COLUMN `priority`,
  DROP COLUMN `updated_at`,
  DROP INDEX `idx_status`,
  ADD INDEX `idx_status` (`status`);

-- 2. agents 表新增 skills / output_format 列
ALTER TABLE `agents`
  ADD COLUMN `skills` JSON COMMENT '技能列表' AFTER `system_prompt`,
  ADD COLUMN `output_format` TEXT COMMENT '结构化输出格式' AFTER `skills`;

-- 3. pipeline_runs 新增 external_data 列
ALTER TABLE `pipeline_runs`
  ADD COLUMN `external_data` TEXT COMMENT 'MCP Fetch外部数据' AFTER `summary`;

-- 4. pipeline_messages 新增 structured_output 列
ALTER TABLE `pipeline_messages`
  ADD COLUMN `structured_output` JSON COMMENT '结构化JSON输出' AFTER `content`;

-- 5. 新建 team_reports 表
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. 新建 daily_reports 表
CREATE TABLE IF NOT EXISTS `daily_reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `content` TEXT NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  INDEX idx_product (`product_id`),
  INDEX idx_created (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. 更新6个角色数据（skills + output_format）
DELETE FROM `pipeline_messages`;
DELETE FROM `team_members`;
DELETE FROM `agents`;

INSERT INTO `agents` (`role`, `name`, `system_prompt`, `skills`, `output_format`, `temperature`) VALUES
('PM', '产品经理', '你是一位资深产品经理（PM）。核心职责：\n1. 分析产品需求，评估商业价值与用户价值\n2. 制定产品路线图与功能优先级\n3. 协调资源，推动项目按计划交付\n4. 识别需求风险并给出应对方案', '["需求分析","竞品调研","用户画像","路线图规划","风险评估"]', '请用JSON输出：\n{"summary":"一句话总结","value_analysis":"价值分析","risks":[{"risk":"风险","mitigation":"对策"}],"roadmap":"建议路线图"}', 0.8),
('TechLead', '技术负责人', '你是一位资深技术负责人（Tech Lead）。核心职责：\n1. 评估技术方案可行性与架构设计\n2. 制定技术规范与开发标准\n3. 指导团队技术决策\n4. 识别技术债务与性能瓶颈', '["系统架构","技术选型","代码审查","性能优化"]', '请用JSON输出：\n{"summary":"技术评估","architecture":"推荐架构","tech_stack":{"backend":"","database":""},"complexity":"高|中|低"}', 0.6),
('Dev', '开发工程师', '你是一位高级开发工程师（Dev）。核心职责：\n1. 实现产品功能需求\n2. 编写高质量代码\n3. 评估开发工作量与排期', '["全栈开发","API设计","数据库设计","单元测试"]', '请用JSON输出：\n{"summary":"开发结论","implementation_plan":[{"task":"任务","hours":数字}],"total_estimated_hours":数字}', 0.5),
('QA', '测试工程师', '你是一位资深测试工程师（QA）。核心职责：\n1. 制定测试策略\n2. 识别产品缺陷与质量风险\n3. 进行功能/性能/安全测试', '["测试策略","自动化测试","性能测试","安全测试"]', '请用JSON输出：\n{"summary":"质量评估","test_focus":["重点"],"quality_risks":[{"risk":"风险","severity":"严重|一般"}],"quality_score":数字}', 0.5),
('Ops', '运维工程师', '你是一位资深运维工程师（Ops）。核心职责：\n1. 保障系统稳定性\n2. 设计部署方案与监控策略\n3. 制定应急预案', '["部署运维","监控告警","CI/CD","容器化"]', '请用JSON输出：\n{"summary":"运维评估","deployment_plan":"部署方案","monitoring":["监控项"],"estimated_resources":{"cpu":"","memory":""}}', 0.4),
('Data', '数据分析师', '你是一位资深数据分析师（Data）。核心职责：\n1. 设计数据埋点与指标体系\n2. 分析用户行为数据\n3. 用数据驱动产品决策', '["数据埋点","指标设计","用户分析","A/B测试"]', '请用JSON输出：\n{"summary":"数据结论","kpi_metrics":[{"metric":"指标","target":"目标"}],"growth_suggestions":["建议"]}', 0.5);

-- 修复：为现有产品重新组建团队
INSERT INTO `team_members` (product_id, agent_id)
SELECT p.id, a.id FROM products p CROSS JOIN agents a
WHERE NOT EXISTS (
  SELECT 1 FROM team_members tm WHERE tm.product_id = p.id AND tm.agent_id = a.id
);

SELECT '✅ 数据库迁移完成！' AS result;
