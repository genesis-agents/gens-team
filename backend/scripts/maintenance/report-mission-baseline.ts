/**
 * Mission 业务基线报告 — L3-W0 #6（2026-07-02）
 *
 * 固化"零下降"验收的业务口径基线：playground mission 的成功率 / 成本 / 时延。
 * L3 波次（W1 策略数据化、W2 反馈管道、W3 扩张闭环）每次转正前后各跑一次，
 * 对比无劣化才算通过业务口径验收（技术口径 = 测试全绿另行看护）。
 *
 * 用法：
 *   本地（需 DATABASE_URL）:  npx tsx scripts/maintenance/report-mission-baseline.ts --days 30
 *   生产（Railway）:          railway run npx tsx scripts/maintenance/report-mission-baseline.ts --days 30 --json
 *
 * --json 输出机器可读快照（stdout 最后一行），建议存档到
 * docs/operations/baselines/mission-baseline-YYYY-MM-DD.json 供波次前后 diff。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "true") : undefined;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

async function main(): Promise<void> {
  const days = Number(arg("days") ?? 30);
  const asJson = arg("json") !== undefined;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const missions = await prisma.agentPlaygroundMission.findMany({
    where: { startedAt: { gte: since } },
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      elapsedWallTimeMs: true,
      runCount: true,
    },
  });

  const byStatus: Record<string, number> = {};
  for (const m of missions) {
    byStatus[m.status] = (byStatus[m.status] ?? 0) + 1;
  }
  // 终态口径：completed 视为成功；failed/rejected 失败；running 不计入分母
  const completed = byStatus["completed"] ?? 0;
  const failed = (byStatus["failed"] ?? 0) + (byStatus["rejected"] ?? 0);
  const terminal = completed + failed;
  const successRate = terminal > 0 ? completed / terminal : null;

  // 时延：优先实测 elapsedWallTimeMs，缺失回退 completedAt-startedAt
  const durationsMs = missions
    .filter((m) => m.status === "completed")
    .map((m) =>
      m.elapsedWallTimeMs != null
        ? m.elapsedWallTimeMs
        : m.completedAt
          ? m.completedAt.getTime() - m.startedAt.getTime()
          : null,
    )
    .filter((v): v is number => v != null && v > 0)
    .sort((a, b) => a - b);

  // 成本：ledger 按 mission 聚合
  const ledger = await prisma.agentPlaygroundMissionCostLedger.groupBy({
    by: ["missionId"],
    where: { createdAt: { gte: since } },
    _sum: { costUsd: true, promptTokens: true, completionTokens: true },
  });
  const costs = ledger
    .map((l) => l._sum.costUsd ?? 0)
    .filter((c) => c > 0)
    .sort((a, b) => a - b);
  const totalTokens = ledger.reduce(
    (acc, l) =>
      acc + (l._sum.promptTokens ?? 0) + (l._sum.completionTokens ?? 0),
    0,
  );

  const snapshot = {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    missions: {
      total: missions.length,
      byStatus,
      successRate: successRate != null ? Number(successRate.toFixed(4)) : null,
      rerunRate:
        missions.length > 0
          ? Number(
              (
                missions.filter((m) => m.runCount > 1).length / missions.length
              ).toFixed(4),
            )
          : null,
    },
    durationMs: {
      count: durationsMs.length,
      p50: percentile(durationsMs, 50),
      p90: percentile(durationsMs, 90),
      p95: percentile(durationsMs, 95),
    },
    costUsdPerMission: {
      count: costs.length,
      p50: percentile(costs, 50),
      p90: percentile(costs, 90),
      p95: percentile(costs, 95),
      total: Number(costs.reduce((a, b) => a + b, 0).toFixed(4)),
    },
    totalTokens,
  };

  console.log(`Mission 基线（近 ${days} 天，${missions.length} 个 mission）`);
  console.log(
    `  成功率: ${successRate != null ? (successRate * 100).toFixed(1) + "%" : "n/a"} ` +
      `(completed=${completed} / terminal=${terminal}, byStatus=${JSON.stringify(byStatus)})`,
  );
  console.log(
    `  时延(completed): p50=${snapshot.durationMs.p50}ms p90=${snapshot.durationMs.p90}ms p95=${snapshot.durationMs.p95}ms`,
  );
  console.log(
    `  成本/mission: p50=$${snapshot.costUsdPerMission.p50} p90=$${snapshot.costUsdPerMission.p90} ` +
      `总计=$${snapshot.costUsdPerMission.total} tokens=${totalTokens}`,
  );
  if (asJson) {
    console.log(JSON.stringify(snapshot));
  }
}

main()
  .catch((err) => {
    console.error("baseline report failed:", err);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
