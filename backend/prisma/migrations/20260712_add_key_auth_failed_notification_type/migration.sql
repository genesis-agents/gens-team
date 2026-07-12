-- BYOK key 连续鉴权失败（AUTH_FAILED × AUTH_DEAD_THRESHOLD）被永久熔断（DEAD）时
-- 站内通知 key 所属用户更换密钥。背景：2026-07-12 生产实证——用户 agnes key 7 月 7 日
-- 起持续 401，直到手动触发摘要才发现，key-health 已标 DEAD 但无任何用户侧提醒。
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'KEY_AUTH_FAILED';
