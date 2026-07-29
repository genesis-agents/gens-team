---
name: project-l3-autonomy-roadmap-2026-07-02
description: L3 自主性四波次计划（W0 造尺子执行中，分支 feat/l3-w0-foundation），用户授权全程自驱，权威文档 docs/architecture/l3-autonomy-roadmap.md
metadata:
  node_type: memory
  type: project
  originSessionId: 825afb14-1cf5-4b63-bebc-0c3f3b25cbb9
---

**L3 自主性路线图（2026-07-02 拍板，用户授权全程自驱"质量/L3/工程/架构/测试/代码质量 100%"）。**

L3 定义 = 自主性阶梯 L1 规则反应式→L2 统计学习→**L3 目标驱动自改**（系统自提策略变更+自验证+自上线/回滚）→L4 自演化。现状 L1.5：自愈（self-heal/failure-learner/预算降级/S12）做到 SOTA，但全部输出是收缩性动作（禁用/降档），无扩张性动作。

**六缺口**（依赖序）：①可信信号（provider 错误 regex→typed error）②可信裁判（eval fail-open 修复+CI 覆盖率+golden 集）③策略即数据（prompt/阈值/拓扑→带版本 DB 配置，最大工作量）④反馈管道（Judge 评分→选举权重影子模式）⑤扩张动作（变体提议器+canary+自动回滚）⑥放权安全网（真 CD）。

**四波次**：W0 造尺子（执行中）→W1 策略数据化（dual-read，2-3 workflow 分批）→W2 反馈管道（影子模式+1-2 周观察）→W3 扩张闭环。**一个 workflow 做不到全程**：尺子悖论（先造尺子才能签零回归）、观察期日历时间不可压缩、变更纪律红线。每波内零丢失 = 旁路接入+flag 默认关+DB 缺省回退代码值+验证屏障。

**已拍板三决策**：W0 立即启动；策略配置用新表带版本+who/when/why 审计；零下降=技术+业务双轨（基线固化进 W0）。

**W0 已全部完成（2026-07-02，7 commits 于 feat/l3-w0-foundation）**：#1 单例 BYOK 竞态 b3b6a42d0（withConfig 绑定视图）· #2 typed error 787313589（classifyProviderFailure 结构化信号优先/regex 兜底，consumers=react-loop）· #3 eval fail-open 2ffb26c37（EVAL_FAIL_CLOSED 开关默认关+常开 abstain warn 观测）· #4 CI 覆盖率 8dba3a21a（test:ci --coverage maxWorkers=2；阈值按实测锁棘轮 pg81/92·harness fn77·engine 74/80，原 95/85 全达不到）· #5 golden eval b4029d809（样本只增不删）· #6 基线脚本 report:mission-baseline（生产首拍待部署后容器内跑）· #7 Dockerfile npm ci be509bffe（backend 独立 lockfile+CI lock-sync dry-run）。**转正观察项**见 roadmap §六：CI 首跑、EVAL_FAIL_CLOSED 翻开关前看 warn 频率、platform settings.spec 并行 flaky 待修。**坑**：ESLint/jest-coverage 大文件必带 NODE_OPTIONS=8192 否则 OOM；jest rootDir=src 故 CLI collectCoverageFrom 用 rootDir 相对路径；railway run 本地连不通内网 DB（须 railway ssh 容器内跑）。

**Why**: 计划曾随挂死 session 丢失一次（只在 transcript 里），故持久化到 docs + memory 双份。
**How to apply**: 继续 L3 工作先读 docs/architecture/l3-autonomy-roadmap.md §六 任务清单；前置输入是 [[project-sota-assessment-2026-07-02]]（docs/architecture/system-sota-assessment-2026-07-02.md）。
