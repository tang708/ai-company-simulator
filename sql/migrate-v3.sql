-- ============================================
-- 数据库增强迁移 v3
-- ============================================
USE `agent`;

-- 1. tasks 表加 agent_id 外键
ALTER TABLE `tasks`
  ADD COLUMN `agent_id` INT NULL AFTER `product_id`,
  ADD INDEX `idx_agent` (`agent_id`),
  ADD FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON DELETE SET NULL;

-- 2. 为已有 tasks 按 assigned_role 回填 agent_id
UPDATE `tasks` t
JOIN `agents` a ON t.assigned_role = a.role
SET t.agent_id = a.id
WHERE t.agent_id IS NULL AND t.assigned_role IS NOT NULL;

-- 3. pipeline_runs 加进度字段
ALTER TABLE `pipeline_runs`
  ADD COLUMN `progress` INT DEFAULT 0 COMMENT '进度 0-100' AFTER `external_data`,
  ADD COLUMN `current_role` VARCHAR(50) DEFAULT NULL COMMENT '当前正在执行的角色' AFTER `progress`;

-- 4. 清理旧 reports 表中的冗余数据（已有 team_reports + daily_reports）
-- 保留表结构但不影响新增功能

-- 5. 增加复合索引优化查询
ALTER TABLE `team_members` ADD INDEX `idx_product_active` (`product_id`, `is_active`);
ALTER TABLE `pipeline_runs` ADD INDEX `idx_product_created` (`product_id`, `started_at`);

SELECT '✅ 数据库增强迁移完成 v3' AS result;
