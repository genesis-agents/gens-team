---
name: project_industry_chain_reasoning_model_empty_2026_06_07
description: 产业链 chain-mapper 空输出根因=推理模型(qwen3-max)被重 prompt 撑爆 8000 输出预算
metadata:
  node_type: memory
  type: project
  originSessionId: 4862591b-2b17-46cf-8f32-b3012e5e2dfa
---

产业链分析(industry-chain) chain-mapper 反复"加载失败/0实体"的根因（2026-06-07 定位，
commit 4a2e2223e 修复并 prod 验证）：

- 用户 BYOK 默认模型 qwen3-max 是**推理模型**，跑在 react loop（ReAct + 工具 + 强约束 JSON
  decision）。当 prompt 要求"全面/不遗漏龙头/逐层穷举"时，模型把 token 预算花在 CoT 思考上，
  在产出最终 JSON 前撞到输出上限 → **content 空、output len=0**。
- 关键：**空但成功的返回既不抛错也不是 isError → 不触发 model failover**（见
  model-failover.util.ts 只认 throw / isError）。react-loop 的 empty-finalize 熔断又因
  thinking 非空被跳过（react-loop.ts:883 `thinking.trim()===""` 才判空）→ 静默 finalize 空 →
  mission 标 FAILED（runMission 0 实体即 FAILED）。
- **`IAgentSpec` 明令禁止硬编码 maxTokens**（harness.interface.ts:77，只能 taskProfile），
  outputLength 最大 "long"=8000。所以无法给推理模型更大输出空间。
- **是我自己 commit d2e047b1e 把 prompt 改"重"导致的回归**：原简单 prompt 能产出（浅但有结果
  11 节点），重 prompt → 输出量+推理量超 8000 → 空。

修法：prompt 回到**中等深度**（4-6 环节、每环节 2-3 家、必须含公认龙头如 NVIDIA/台积电、
显式要求"简洁、直接输出 JSON、不要冗长推理"），保留 taskProfile outputLength:"long" + 空结果
重试一次。prod 验证 COMPLETED：16 节点/5 环节/11 公司，含 NVIDIA/AMD/Intel/三星/SK海力士/
美光/AWS/Azure/谷歌云/英业达/广达。

**Why:** 推理模型 + 强约束 JSON + "穷举式" prompt = 输出预算被思考吃光 → 空输出 → 不 failover。
**How to apply:** 给推理模型写 agent prompt 时**控制输出体量**并显式压制冗长推理；不要假设"prompt
越详尽越好"。验证 prod 用 railway run 自签 JWT(sub=userId 18780216) 打 api.gens.team 触发+轮询。
关联 [[project_industry_chain_startuphub_tool_2026_06_06]]、[[project_self_driven_e2e_verified_2026_06_05]]（显式传 model 关 failover 那条同源教训）。
