---
name: feedback_ui_governance_no_fake_exceptions
description: UI 治理用户铁律——不接受假例外，实事求是；到 0 后全部规则焊死
metadata:
  node_type: memory
  type: feedback
  originSessionId: e234e058-6f7c-42f0-837c-b4394332c29f
---

UI-discipline（及同类看护规则）治理时用户的硬性立场（2026-05-20 多轮明确）。

**Why:** 用户看到 audit 靠一堆 allowlist 凑到 0，连说「不接受例外 / 为什么要例外 / 实事求是吧」；最后「规则全部焊死」。他要的是真合规，不是名单刷绿。

**How to apply:**

- **规则定错就改规则，不要给个案开例外。** 例：R11 强制 `onVisibilityToggle` 是越界（全应用仅 Topic 有真可见性模型）→ 把通用基线改成 `onEdit+onDelete`、清空 `R11_BESPOKE_OK`，而不是把 4 张卡逐个豁免。
- **缺真功能 → 要么建、要么诚实说做不了，绝不造死开关。** 给没有可见性后端的实体加 toggle = 翻一个没人读的字段，比例外更糟。建真功能（schema+接口+过滤+入口+UI）属带产品语义的功能项，必须先确认语义再动。
- **allowlist 只留给 canonical 真不适配的场景**（按钮内小环 ≠ 加载屏、命令面板 ≠ Modal、布局骨架 ≠ 通用 skeleton），且**逐源留痕原因**。这是「实事求是」，不是假合规。
- **到 TOTAL=0 后把规则全部焊死**（升 `HARD_ZERO_RULES`，退出 warn-only 灰度，任一违规 exit 1 拒推）。
- 区分三类剩余：真违规（迁）/ 规则越界（改规则）/ 真 bespoke（allowlist+留痕）——不要混为一谈一律 allowlist。

落地见 [[project_ui_discipline_hardzero_2026_05_20]]。决断风格见 [[feedback_execution_style]]。
