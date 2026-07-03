-- L3 W1 策略数据化：PolicyConfig 表（设计稿 docs/architecture/policy-config-design.md）
-- append-only 版本化策略配置：prompt / 阈值 / 拓扑，dual-read 由 PolicyConfigService 实现

-- CreateEnum
CREATE TYPE "PolicyKind" AS ENUM ('PROMPT', 'THRESHOLD', 'TOPOLOGY');

-- CreateTable
CREATE TABLE "policy_configs" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "PolicyKind" NOT NULL,
    "value" JSONB NOT NULL,
    "contentHash" VARCHAR(16) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" VARCHAR(200) NOT NULL,
    "changeReason" TEXT NOT NULL,
    "activatedBy" VARCHAR(200),
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "policy_configs_key_version_key" ON "policy_configs"("key", "version");

-- CreateIndex
CREATE INDEX "policy_configs_key_isActive_idx" ON "policy_configs"("key", "isActive");

-- CreateIndex
CREATE INDEX "policy_configs_kind_isActive_idx" ON "policy_configs"("kind", "isActive");
