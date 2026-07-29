---
name: agent-playground-quality-gap-2026-04-29
description: 当前 mission 实际产出字数与 lengthProfile 承诺严重不符；leader 签字门槛常拒绝；近 5 个 mission 全失败/取消/quality-failed
type: project
originSessionId: e9f587b9-3572-4652-bf01-a151597e4ef6
---

## 现状 (2026-04-29 观测)

**用户 18780216 最近 5 个 mission 全部 not-completed**：

| 时间            | topic          | profile        | status         | tokens | leader-score | 实际字数    |
| --------------- | -------------- | -------------- | -------------- | ------ | ------------ | ----------- |
| 04-29 00:00     | 美国AI宏观洞察 | extended (25K) | quality-failed | 1.1M   | 48/100       | **5107 字** |
| 04-28 22:09     | 同上           | extended       | failed         | 842K   | -            | -           |
| 04-28 21:25     | 同上           | extended       | cancelled      | -      | -            | -           |
| 04-28 19:02     | 同上           | extended       | failed         | -      | -            | -           |
| 04-28 (earlier) | 同上           | extended       | failed         | -      | -            | -           |

## 根本缺口

**1. lengthProfile 是空头支票**

- extended 档位承诺 25000 字，实际产出 5107 字 (20%)
- 我刚加的 epic (80K) / mega (200K) 还需实测兑现率
- 原因：chapter-writer 默认 ~1500 字/章，章节数也少；prompt 鼓励"段落论述"但不强制字数

**2. Leader 签字门槛过严**

- `coverageScore < 90` 强制 quality-failed
- 即使产出 110 万 tokens、63 分钟、$3.31，也被拒绝
- 部分 dim partial 即否决整个 mission

**3. 维度间不平衡**

- 7 个维度但 fact 集中在 1-2 个，dim-1 / dim-4 总是 partial

## 用户期望

- 字数应能达到 20 万字（mega 档位）
- 单 todo 重跑（已落地）
- 报告超越 TI（视觉已落地，质量待验证）

## How to apply

- 改 lengthProfile 时，**必须实测产出兑现率**（落库 wordCount vs target，> 80% 才算成功）
- Leader signoff 阈值需要分档（quick=70, deep=80, mega=85）
- 推 mega 档位测试前先调 leader threshold 放宽，否则必然 quality-failed
- 不要假设 LLM 会自动产出 25K 字章节——需要 prompt 强制 "字数 < 80% target 必须扩写"
