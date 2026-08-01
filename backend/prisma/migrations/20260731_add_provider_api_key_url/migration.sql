-- AIProvider 新增 api_key_url：申领 API Key 的控制台页地址（2026-07-31）
--
-- 背景：用户在「API Keys」页配置 Personal Key 时，界面上没有任何"去哪申请 Key"
-- 的指引。ai_providers 表已有 doc_url，但它存的是**文档首页**
-- （如 https://platform.openai.com/docs），用户还要自己在文档里翻找控制台入口。
-- 故新增专用字段直达申领页，doc_url 保持原语义不动。
--
-- 为什么必须在迁移里回填（而不是只改 seed catalog）：
--   AiProvidersSeeder 是 **create-only** 语义（只在该 slug 的 system 行不存在时
--   create，绝不 update 已存在行，以免覆盖 admin 在 /admin/ai-providers 改过的
--   配置）。因此往 AI_PROVIDER_CATALOG 加字段，对**已经存在的行毫无作用**——
--   现网 37 个 provider 全部已存在，不回填就永远是 NULL。
--
-- 回填口径：
--   - 只填公开可查、且确为"API Key 申领/管理页"的地址；拿不准的留 NULL，
--     前端会回落到 doc_url。错误的链接比没有链接更糟。
--   - 本地部署类（ollama / vllm / lmstudio）不需要 Key，恒 NULL。
--   - WHERE api_key_url IS NULL 保证幂等，且不覆盖 admin 已手工填过的值。

ALTER TABLE "ai_providers"
  ADD COLUMN IF NOT EXISTS "api_key_url" VARCHAR(500);

UPDATE "ai_providers" AS p
SET "api_key_url" = v.url
FROM (VALUES
  -- ── 国际前沿 ──
  ('openai',       'https://platform.openai.com/api-keys'),
  ('anthropic',    'https://console.anthropic.com/settings/keys'),
  ('google',       'https://aistudio.google.com/apikey'),
  ('xai',          'https://console.x.ai'),
  ('deepseek',     'https://platform.deepseek.com/api_keys'),
  ('cohere',       'https://dashboard.cohere.com/api-keys'),
  ('mistral',      'https://console.mistral.ai/api-keys'),
  ('perplexity',   'https://www.perplexity.ai/settings/api'),
  -- ── 国内 ──
  ('qwen',         'https://dashscope.console.aliyun.com/apiKey'),
  ('zhipu',        'https://bigmodel.cn/usercenter/apikeys'),
  ('glm',          'https://bigmodel.cn/usercenter/apikeys'),
  ('moonshot',     'https://platform.moonshot.cn/console/api-keys'),
  ('kimi',         'https://platform.moonshot.cn/console/api-keys'),
  ('doubao',       'https://console.volcengine.com/ark'),
  ('bytedance',    'https://console.volcengine.com/ark'),
  ('minimax',      'https://platform.minimaxi.com/user-center/basic-information/interface-key'),
  ('siliconflow',  'https://cloud.siliconflow.cn/account/ak'),
  -- ── 聚合 / 推理平台 ──
  ('openrouter',   'https://openrouter.ai/keys'),
  ('together',     'https://api.together.xyz/settings/api-keys'),
  ('fireworks',    'https://fireworks.ai/account/api-keys'),
  ('deepinfra',    'https://deepinfra.com/dash/api_keys'),
  ('groq',         'https://console.groq.com/keys'),
  -- ── 向量 / 重排 ──
  ('voyage',       'https://dashboard.voyageai.com/organization/api-keys'),
  ('jina',         'https://jina.ai/api-dashboard/')
) AS v(slug, url)
WHERE p."slug" = v.slug
  AND p."scope" = 'system'
  AND p."api_key_url" IS NULL;
