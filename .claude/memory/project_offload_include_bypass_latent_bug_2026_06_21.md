---
name: project_offload_include_bypass_latent_bug_2026_06_21
description: 既有列级 offload 目标存在 hydrate-bypass 隐患（父表 include / partial-select 读空），影响报告生成
metadata:
  node_type: memory
  type: project
  originSessionId: c22ebf52-3f0c-4ed1-b7d9-293785dc537b
---

**列级 offload 的 hydrate-bypass 隐患影响的是「既有 offload 目标」,不只我回退的那批（2026-06-21 审计实证）**

Prisma `$extends` 透明 hydrate **只对顶层 `prisma.{model}.findX` 触发**;**父表 include 读子表 + 顶层 select 漏 uri** 都绕过 → offload 后读空。这个坑不止影响我之前回退的内容列,**既有的 `topic_evidences.snippet` / `dimension_analyses.dataPoints,summary` / `research_tasks.result` offload 目标本身就有 8 处不安全读**:

- **A 类(顶层 select 漏 uri,补 uri 即修)**:`topic-team-orchestrator.service.ts:1052`、`synthesis-report.executor.ts:147`、`topic-report-import.service.ts:246`(都 select snippet 漏 snippetUri)
- **B 类(父表 include,须改顶层分查)**:`topic-crud.service.ts:399`、`research-memory.service.ts:63`(researchMission→tasks 读 result)、`report-validation.service.ts:63-71`(topicReport→{evidences,dimensionAnalyses} → 读 da.dataPoints@322/335、evidences via include)、report-synthesis/report-data/credibility/mission-execution 多处 `topicReport/dimensionAnalysis→evidences` include

**实际影响=低(冷路径)**:report-validation 对空 dataPoints 是 `if(!dataPoints)return` 优雅跳过(静默少做一致性校验,不崩);report 生成的 prompt 用 `e.fullContent||e.snippet||'暂无内容'` 有兜底;且**live 生成用的是刚建的新 evidence(未 offload),只有重读/重校验老报告才命中空**。`report.fullReport` 自身是顶层 topicReport 读 → 正常 hydrate,用户看到的报告正文没问题。

**关键决策(为什么不修 offload 服务)**:`StorageOffloadService` 当前因泄漏锁(pg advisory lock 连接池失效,同 EventArchive 那个 bug)**停摆**。topic_evidences/research_tasks 只部分 offload(snippet 21768 行、result 7620 行**未搬**)。**修好 offload 服务会把剩余行也搬走 → 让 include-bypass 读空范围变大 → 隐患加重**。所以**故意不修 offload 服务**(停摆=保护),正确顺序是:**先修这 8 处读路径(A 类补 uri / B 类 include 改顶层 `prisma.{child}.findMany({where:{parentId},select:{...,uri:true}})`)+ 测报告生成,再恢复 offload**。

**结论**:列级 offload(阶段②)**暂缓**——为 ~32MB 冒报告读空的险不划算。存储目标已由事件大表归档达成(见 [[project_storage_growth_dual_mechanism_2026_06_20]],1342MB→739MB)。读路径修复列为独立计划项,不做生产盲改。
