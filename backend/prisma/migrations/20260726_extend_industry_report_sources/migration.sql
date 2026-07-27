-- Extend industry-report sources: 网络 / 光 / 安全 / 计算 四条线的行业信源
-- (third-party sources coverage, 2026-07-26)
--
-- 分层约定（用 credibilityScore 表达，无新增字段）：
--   >= 0.90  真值源（数字 + 方法论）：Dell'Oro / LightCounting，及免费 P 级
--            权威年报（Verizon DBIR / Epoch AI）
--   0.85-0.88 一线专业源 / 免费权威（Omdia / Cignal AI / Yole / Optica-OIDA /
--            Uptime / TechInsights / M-Trends）
--   0.80-0.82 交叉验证源（CrowdStrike / WEF / Jon Peddie / IBM）
--
-- 幂等 + 不覆盖线上配置：
--   - 只向现有 config.sources 追加，按 id 或 domain 去重（线上白名单已被
--     管理员扩过，如 gartner/idc 等，不得重复或覆盖）
--   - 行不存在时 no-op（20260315 迁移保证 fresh DB 有 industry-report 行）
--
-- 域名说明：
--   - omdia.tech.informa.com 为 Omdia 正式站点（omdia.com 是跳转壳）
--   - cloud.google.com/security 带路径：仅用于 site: 定向检索 Mandiant
--     M-Trends（已并入 Google Cloud）；citation 侧按 hostname 精确/子域匹配，
--     带路径条目不会命中，不会污染普通 GCP 页面的信誉分
--   - verizon.com / ibm.com / weforum.org 是宽企业域，分数已按"域内非报告
--     页面也会命中"的风险下调

UPDATE tool_configs
SET config = jsonb_set(
  config,
  '{sources}',
  COALESCE(config->'sources', '[]'::jsonb) || (
    SELECT COALESCE(jsonb_agg(n.src), '[]'::jsonb)
    FROM jsonb_array_elements('[
      {"id":"delloro","name":"Dell''Oro Group","domain":"delloro.com","category":"networking-market","credibilityScore":0.93,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO","EVENT"]},
      {"id":"omdia","name":"Omdia","domain":"omdia.tech.informa.com","category":"networking-market","credibilityScore":0.86,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO"]},
      {"id":"650group","name":"650 Group","domain":"650group.com","category":"networking-market","credibilityScore":0.85,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO"]},
      {"id":"synergy-research","name":"Synergy Research Group","domain":"srgresearch.com","category":"networking-market","credibilityScore":0.85,"enabled":true,"topicTypes":["MACRO","COMPANY"]},
      {"id":"telegeography","name":"TeleGeography","domain":"telegeography.com","category":"networking-market","credibilityScore":0.85,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO"]},
      {"id":"lightcounting","name":"LightCounting","domain":"lightcounting.com","category":"optical-market","credibilityScore":0.93,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO"]},
      {"id":"cignal-ai","name":"Cignal AI","domain":"cignal.ai","category":"optical-market","credibilityScore":0.85,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO"]},
      {"id":"yole-group","name":"Yole Group","domain":"yolegroup.com","category":"optical-market","credibilityScore":0.85,"enabled":true,"topicTypes":["TECHNOLOGY"]},
      {"id":"optica-oida","name":"Optica / OIDA","domain":"optica.org","category":"optical-industry","credibilityScore":0.88,"enabled":true,"topicTypes":["TECHNOLOGY","EVENT"]},
      {"id":"ofc-conference","name":"OFC Conference","domain":"ofcconference.org","category":"optical-industry","credibilityScore":0.85,"enabled":true,"topicTypes":["TECHNOLOGY","EVENT"]},
      {"id":"verizon-dbir","name":"Verizon DBIR","domain":"verizon.com","category":"security-report","credibilityScore":0.90,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO","EVENT"]},
      {"id":"mandiant-mtrends","name":"Mandiant M-Trends (Google Cloud)","domain":"cloud.google.com/security","category":"security-report","credibilityScore":0.88,"enabled":true,"topicTypes":["TECHNOLOGY","EVENT"]},
      {"id":"crowdstrike","name":"CrowdStrike","domain":"crowdstrike.com","category":"security-report","credibilityScore":0.82,"enabled":true,"topicTypes":["TECHNOLOGY","EVENT"]},
      {"id":"ibm-security","name":"IBM Security","domain":"ibm.com","category":"security-report","credibilityScore":0.80,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO"]},
      {"id":"wef-cyber","name":"WEF Global Cybersecurity Outlook","domain":"weforum.org","category":"security-report","credibilityScore":0.82,"enabled":true,"topicTypes":["MACRO"]},
      {"id":"epoch-ai","name":"Epoch AI","domain":"epoch.ai","category":"compute-research","credibilityScore":0.90,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO"]},
      {"id":"uptime-institute","name":"Uptime Institute","domain":"uptimeinstitute.com","category":"compute-research","credibilityScore":0.87,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO"]},
      {"id":"techinsights","name":"TechInsights","domain":"techinsights.com","category":"compute-research","credibilityScore":0.86,"enabled":true,"topicTypes":["TECHNOLOGY","COMPANY"]},
      {"id":"jon-peddie","name":"Jon Peddie Research","domain":"jonpeddie.com","category":"compute-research","credibilityScore":0.82,"enabled":true,"topicTypes":["TECHNOLOGY","MACRO"]}
    ]'::jsonb) AS n(src)
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(config->'sources', '[]'::jsonb)) AS o(src)
      WHERE o.src->>'id' = n.src->>'id'
         OR lower(o.src->>'domain') = lower(n.src->>'domain')
    )
  )
),
updated_at = NOW()
WHERE tool_id IN ('industry-report', 'industry-report-search');
