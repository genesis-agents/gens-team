---
name: feedback-background-spenders-default-off
description: "任何后台自动触发 LLM/BYOK/credit/外部花费的机制必须默认 OFF(显式 opt-in),即使已有守卫"
metadata:
  node_type: memory
  type: feedback
  originSessionId: aa7b8f6c-d97e-4b52-a56e-ff61bfd4e543
---

任何**后台无人值守、会触发 LLM 调用 / 消耗 credit / 烧 BYOK provider token / 产生外部副作用(发帖、发邮件、webhook、爬虫)**的机制,**默认必须关闭**,只能通过显式 env flag / DB 配置 opt-in 开启。**即使它已经有其它守卫(并发锁、预算、健康检查)也要默认关。**

**Why:** 2026-05-25 线上事故 —— 一个带自动刷新的"专题"被 `TopicRefreshScheduler` 每小时反复并发刷新、`ResearchMissionHealthService` 启动时又把所有 EXECUTING mission 自动重新拉起,后台静默跑全量研究报告,烧的是 BYOK 用户自己的 DeepSeek 账单(平台 credit 闸对 BYOK 不生效),重启都停不下来。用户原话:"怎么会有背后默默烧钱的机制,疯了封了""默认都应该是关闭,即使有"。

**How to apply:** 新增/审查任何 `@Cron` / `@Interval` / `setInterval` 工作循环 / 队列 worker / `onModuleInit`/`onApplicationBootstrap` 启动任务 / resume-on-boot / health-check-revive,只要它(哪怕间接)会调 LLM(AiChatService/ChatFacade/executeRefresh/generate/embed)或发外部请求 —— 必须:① 默认 OFF 的 env 开关(如 `ENABLE_TOPIC_AUTO_REFRESH` / `ENABLE_RADAR_SCHEDULER` / `ENABLE_RESEARCH_MISSION_AUTORECOVERY`,或 config 默认 false);② 防重叠并发锁(原子 claim / in-flight 检查),见 [[feedback-commit-msg-file-fallback]] 同期事故修复的 topic-refresh.scheduler 模式。只标记 stuck 为 FAILED、清理缓存、flush 指标这类"降低消耗/纯基础设施"的循环可保持默认开。已落地默认关:topic-refresh、research-mission-health 启动恢复、radar-refresh 三 cron、social publish-scheduler、dreaming/reflection。
