-- 20260804: 回填被旧默认值 4096 化石化的模型输出上限
--
-- 根因链（AI 洞察 / 报告大量兜底落地）：
--   2025-11-25 首个 ai_models 迁移把当时那代模型（gpt-4-turbo / claude-3-opus）的
--   真实输出上限 4096 固化成 DDL 默认值 + 种子数据；20260421 建 user_model_configs
--   时照抄了 DEFAULT 4096；前端表单预填又把"默认值"变成"用户显式值"落库。
--   模型换代后，运行时把 max_tokens 当硬闸 clamp（TaskProfileMapper 第 3 步 +
--   AiChatFailoverCaller），长输出请求（extended 32K / long 28K）被砍到 4096 →
--   巨型 JSON 必截断 → 解析失败 → 兜底落库。
--
-- 本迁移只更新仍停留在旧默认值 4096 的行；其他值视为用户/管理员显式配置，不动。
-- 已知上限表与 ai-engine/llm/types/task-profile.types.ts 的 MODEL_KNOWN_LIMITS
-- 逐行一致（有序前缀匹配，priority 越小越先匹配；grok-4.5 必须先于 grok-4）。
-- 已知上限 <= 4096 的旧模型（gpt-4-turbo / claude-3-opus / claude-3-haiku）被
-- max_out > 4096 条件自然跳过；名单外模型不动（无法区分真实上限与化石默认值）。
-- 非文本输出类型（EMBEDDING / RERANK / IMAGE_*）不参与。

WITH known_limits(prefix, max_out, priority) AS (
  VALUES
    ('gpt-4o-mini'::text, 16384::int, 1::int),
    ('gpt-4o', 16384, 2),
    ('gpt-4-turbo', 4096, 3),
    ('gpt-4', 8192, 4),
    ('o1-mini', 65536, 5),
    ('o1-pro', 100000, 6),
    ('o1', 100000, 7),
    ('o3-mini', 65536, 8),
    ('o3', 100000, 9),
    ('o4-mini', 100000, 10),
    ('claude-sonnet-4', 16384, 11),
    ('claude-opus-4', 16384, 12),
    ('claude-3.5-sonnet', 8192, 13),
    ('claude-3.5-haiku', 8192, 14),
    ('claude-3-opus', 4096, 15),
    ('claude-3-sonnet', 8192, 16),
    ('claude-3-haiku', 4096, 17),
    ('gemini-2.5', 65536, 18),
    ('gemini-2.0', 8192, 19),
    ('gemini-3', 65536, 20),
    ('grok-3', 131072, 21),
    ('grok-4.5', 131072, 22),
    ('grok-4', 16384, 23),
    ('deepseek-reasoner', 65536, 24),
    ('deepseek-chat', 8192, 25)
)
UPDATE "ai_models" m
SET "max_tokens" = (
  SELECT kl.max_out FROM known_limits kl
  WHERE lower(m."model_id") LIKE kl.prefix || '%'
  ORDER BY kl.priority ASC
  LIMIT 1
)
WHERE m."max_tokens" = 4096
  AND m."model_type"::text NOT IN ('EMBEDDING', 'RERANK', 'IMAGE_GENERATION', 'IMAGE_EDITING')
  AND COALESCE((
    SELECT kl.max_out FROM known_limits kl
    WHERE lower(m."model_id") LIKE kl.prefix || '%'
    ORDER BY kl.priority ASC
    LIMIT 1
  ), 0) > 4096;

WITH known_limits(prefix, max_out, priority) AS (
  VALUES
    ('gpt-4o-mini'::text, 16384::int, 1::int),
    ('gpt-4o', 16384, 2),
    ('gpt-4-turbo', 4096, 3),
    ('gpt-4', 8192, 4),
    ('o1-mini', 65536, 5),
    ('o1-pro', 100000, 6),
    ('o1', 100000, 7),
    ('o3-mini', 65536, 8),
    ('o3', 100000, 9),
    ('o4-mini', 100000, 10),
    ('claude-sonnet-4', 16384, 11),
    ('claude-opus-4', 16384, 12),
    ('claude-3.5-sonnet', 8192, 13),
    ('claude-3.5-haiku', 8192, 14),
    ('claude-3-opus', 4096, 15),
    ('claude-3-sonnet', 8192, 16),
    ('claude-3-haiku', 4096, 17),
    ('gemini-2.5', 65536, 18),
    ('gemini-2.0', 8192, 19),
    ('gemini-3', 65536, 20),
    ('grok-3', 131072, 21),
    ('grok-4.5', 131072, 22),
    ('grok-4', 16384, 23),
    ('deepseek-reasoner', 65536, 24),
    ('deepseek-chat', 8192, 25)
)
UPDATE "user_model_configs" u
SET "max_tokens" = (
  SELECT kl.max_out FROM known_limits kl
  WHERE lower(u."model_id") LIKE kl.prefix || '%'
  ORDER BY kl.priority ASC
  LIMIT 1
)
WHERE u."max_tokens" = 4096
  AND u."model_type"::text NOT IN ('EMBEDDING', 'RERANK', 'IMAGE_GENERATION', 'IMAGE_EDITING')
  AND COALESCE((
    SELECT kl.max_out FROM known_limits kl
    WHERE lower(u."model_id") LIKE kl.prefix || '%'
    ORDER BY kl.priority ASC
    LIMIT 1
  ), 0) > 4096;
