# L3 自主性路线图（四波次计划）

> **状态**: W1 代码线完成——批 1/2a/2b/2c/3a/3b 全部提交（基建 + 9 模块 dual-read + canonical prompt 契约 + backfill 脚本）。剩余：推送（等凭据）→ CI 首跑观察 → 部署后人工灰度闸（backfill propose → staging 逐 key activate → mission 实跑验证 → rollback 演练）→ W2 telemetry 溯源对接（设计已定，`getPlaygroundPromptResolution` 挂点就绪）
> **拍板日期**: 2026-07-02（用户授权全程自驱："质量 100%，L3 能力 100%，未来的工程/架构/测试/代码质量 100%"）
> **执行分支**: `feat/l3-w0-foundation`（W0）→ `feat/l3-w1-policy-config`（W1）
> **W1 设计稿**: [policy-config-design.md](policy-config-design.md)（表结构 / dual-read / 分批计划 / playground↔insight 复制真实形态摸底）
> **前置输入**: [system-sota-assessment-2026-07-02.md](system-sota-assessment-2026-07-02.md)（五路并行审计交叉校验）

## 一、L3 的定义（自主性阶梯）

- **L1 规则反应式**：固定阈值触发固定动作
- **L2 统计学习策略**：从结果数据调整决策权重
- **L3 目标驱动自改**：系统自己提出策略变更（prompt / 模型选择 / 团队拓扑 / 阈值）、自己验证、自己上线或回滚
- **L4 自演化**：自己改代码并验证上线

**现状定位：L1.5。** "自愈"（homeostasis，回到预设稳态）已做到业界少见的深度——CapabilitySelfHealService 四重严校 + cooling-off、FailureLearnerService 失败模式学习 + preDisable、梯度预算降级、S12 postmortem 闭环。但所有学习机制的输出都收敛到"禁用/降档"这一类**收缩性动作**，没有任何机制能产生**扩张性动作**（尝试新策略并验证）。自愈是回到预设稳态，自主是修改稳态本身。

## 二、到 L3 的六块缺口（按依赖顺序）

| #   | 缺口           | 具体工作                                                                                                                                                                                    | 落点                                                                 |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | **可信信号**   | provider 错误从 regex 文案匹配 → adapter 层 typed error 分类学（已因 xAI/OpenAI 文案差异修过两次，FailureLearner 记录的 failureCode 有污染风险——信号质量是所有上层学习的地基）              | `ai-engine/llm/providers/*`（5 个 caller）                           |
| 2   | **可信裁判**   | 修 eval fail-open（解析失败回假 50 分 / 空 verdicts 默认 pass）；golden 数据集回归 eval 套件；CI 覆盖率强制（1 行）+ e2e 冒烟进 CI                                                          | `ai-harness/evaluation/verify/*` + CI                                |
| 3   | **策略即数据** | prompt 模板、团队拓扑、阈值常量从代码抽成带版本号的 DB 配置，代码值降级为 fallback（playground↔deep-insight 24 文件复制正是"策略以代码存在"的症状——系统改不了自己的代码，只能改自己的数据） | 分散在 ~20 个 ai-app 模块，**最大工作量**                            |
| 4   | **反馈管道**   | JudgeService 评分 → 模型选举权重（骨架都在，缺一根管子）；S12 recommendations 从 plain text → 结构化 prior，mission 启动时真消费（照抄 FailureLearner `lookupFallback` 模式）               | `evaluation` → `llm/models/selection`；`s12-self-evolution.stage.ts` |
| 5   | **扩张性动作** | 变体提议器（对 prompt/模型/阈值生成候选变更）+ 影子/灰度执行 + 自动对比 + 自动回滚，全程预算封顶                                                                                            | 新增，挂 `lifecycle/learning/`                                       |
| 6   | **放权安全网** | 真 CD（deploy.yml 现为 placeholder）+ canary 机制 + 爆炸半径控制                                                                                                                            | 基建，部分在代码库之外（Railway 配置）                               |

**已有的文化基建**（放权的底子）：`HARNESS_REACT_NATIVE_FC` 转正开关、harness 灰度 rollout pct、`CapabilityFeatureFlagsService`、cooling-off 守护——系统已经会"带保险丝做变更"，缺的是把这套机制从"人拍板的变更"泛化到"系统自提的变更"。

## 三、为什么一个 workflow 做不到（三个硬约束）

1. **尺子悖论**："零下降"要先有能测出"下降"的尺子。当前覆盖率在 CI 空转、e2e 不进 CI、eval 自己还 fail-open——用这套体系给大变更签"零回归"，签字本身不可信。第一波必须是**造尺子**，串行依赖。
2. **日历时间不可压缩**：策略类变更的"零下降"无法静态证明——只能靠影子模式跑真实 mission 流量对比若干天。workflow 能压缩写码和自检，压缩不了观察期。
3. **变更纪律**：一次性改 runner + llm + evaluation + lifecycle + 20 个 ai-app + CI = 全系统核心路径一锅端，直接违反本项目红线（2026-02-10 sub-agent 越权事故教训）。

## 四、四波次计划（每波一个 workflow，波内零丢失）

**统一零丢失模式**：新能力全部旁路接入（feature flag 默认关 / 影子模式只记录不生效 / DB 缺省回退代码值），现有路径一行为不变；workflow 内置验证屏障跑 verify:arch + 全量测试 + 类型检查，红了不出货。

| 波次                    | 内容                                                                                                                    | 零下降保障                                                             | 规模                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------- |
| **W0 造尺子**（执行中） | typed error 归一化、eval fail-open 修复、CI 覆盖率开启、golden eval 数据集骨架、单例竞态 P0 修复 ✅、基线指标固化       | 纯加固，无行为变更面；typed error 双轨过渡（新分类器优先、regex 兜底） | 一个 workflow                       |
| **W1 策略数据化**       | prompt/阈值/拓扑抽带版本 DB 配置，dual-read（DB 有值用 DB，否则代码常量），顺手消灭 playground↔deep-insight 24 文件复制 | dual-read + 逐模块 flag；DB 空 = 行为逐字节等同现状，快照对比测试证明  | 最重，拆 2-3 个 workflow 按模块分批 |
| **W2 反馈管道**         | eval→选举权重（**影子模式**：只记录"如果生效会选谁"）、结构化 postmortem prior                                          | 影子模式天然零影响；观察 1-2 周对比日志后人工拍板转正                  | 一个 workflow + 观察期              |
| **W3 扩张闭环**         | 变体提议器 + canary 执行（限定 N% mission、预算封顶）+ 自动对比回滚                                                     | 只对 opt-in 流量生效；指标劣化自动回滚到 W1 版本化配置                 | 一个 workflow + 真 CD 基建          |

总日历时间估计 4-6 周（写码约一半，观察期约一半）。W2→W3 之间及每波转正前的影子观察期是人必须在场的地方——这是"零下降"承诺的诚实成本。

## 五、已拍板的三个决策（2026-07-02 自驱决策，有异议请推翻）

1. **W0 立即启动**——与 L3 无关也全是净收益（都在 SOTA 报告"立即"清单里）
2. **策略配置用新表**（非扩展 AgentConfig）：带版本号 + who/when/why 审计字段——审计链是 L3 回滚的依据
3. **"零下降"验收口径 = 技术 + 业务双轨**：测试全绿 + 影子对比无劣化，且 mission 成功率/成本/时延基线固化进 W0

## 六、W0 任务清单

| #   | 任务                                                                          | 状态                                                                 |
| --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | 单例 adapter BYOK 竞态 P0 修复（withConfig 绑定视图 + 竞态复现测试）          | ✅ `b3b6a42d0`                                                       |
| 2   | provider typed error 归一化（结构化信号优先、regex 兜底双轨）                 | ✅ `787313589`                                                       |
| 3   | eval fail-open 修复（`EVAL_FAIL_CLOSED` 开关 + 常开观测 warn）                | ✅ `2ffb26c37`                                                       |
| 4   | CI 覆盖率开启强制（阈值按实测锁棘轮：pg 81/92、harness fn77、engine 74/80）   | ✅ `8dba3a21a`                                                       |
| 5   | golden eval 数据集骨架（verdict 解析 + consensus 样本，只增不删）             | ✅ `b4029d809`                                                       |
| 6   | 业务基线报告脚本 `npm run report:mission-baseline`（成功率/成本/时延 p50-95） | ✅（生产首拍待下次部署后容器内跑，脚本已随镜像 COPY scripts 进容器） |
| 7   | Dockerfile 改 `npm ci` + backend 独立 lockfile + CI lock-sync 校验            | ✅ `be509bffe`                                                       |

### W0 收尾后的下一步（W0 转正观察项）

1. **CI 首跑观察**：本分支推送后看 `test:ci --coverage` 在 GH runner 的耗时/内存与阈值是否绿（阈值=模块内实测下界，全量只会更高，理论必绿）
2. **EVAL_FAIL_CLOSED 翻开关前**：先看生产日志里 "all judges abstained" warn 的触发频率（常开观测已埋）
3. **生产基线首拍**：下次部署后 `railway ssh` 容器内跑 baseline 脚本存档 `docs/operations/baselines/`
4. **已知 flaky**：platform settings.service.spec 并行+coverage 下偶发（单跑绿），W1 前修
5. W1（策略数据化）开工前先建 `PolicyConfig` 新表设计稿（带版本 + who/when/why 审计字段，决策 §五-2）
