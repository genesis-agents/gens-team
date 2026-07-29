---
name: feedback_dont_migrate_ciphertext
description: schema migration 不要自作主张把加密字段从 A 表抄到 B 表；运行时假设格式不同就会静默 401
type: feedback
originSessionId: 7d028ab3-e546-4f0f-9b44-f6ee8ffbc81d
---

migration.sql 里看到 A 表加密字段（如 AES-CBC 密文 + iv）需要"迁移到"B 表的 apiKey 字段时，**不要自动写入**——除非两边解密路径完全一致（同 EncryptionService、同 key version、同 IV 处理）。

**Why**: 2026-05-08 BYOK v5 重构（drop_distributable_keys）round 1 安全评审发现：migration Step 2 想把 DistributableKey.encrypted_value（AES 密文）写入 AIModel.apiKey，但运行时 resolveModelApiKey 直接 `.trim()` 返回（明文期望），写入会导致 100% 401。

**How to apply**：

- migration 只做 schema 变更（DDL）+ 关联 ID 重映射；密文/敏感字段的"内容迁移"留给应用层（如 admin UI 提示重配）
- 在 migration 注释里明确写"admin 必须在 deploy 后做 X"
- 评审 migration 时第一问："这段 INSERT/UPDATE 有没有跨越加密边界？" 有就拒
