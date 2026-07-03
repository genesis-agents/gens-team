-- L3 W1 深度检视修复（P1）：DB 级兜底「每 key 至多一行 isActive=true」
-- READ COMMITTED 下并发 activate 的 updateMany 语句快照互相看不见对方刚激活的行，
-- 应用层事务无法单独保证唯一性——partial unique index 让后提交的事务撞约束中止，
-- service 层捕获 P2002 重试一次即收敛（policy-config.service.ts activate）。

CREATE UNIQUE INDEX "policy_configs_one_active_per_key"
  ON "policy_configs"("key")
  WHERE "isActive" = true;
