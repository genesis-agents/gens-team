/**
 * 迁移卫生 — 禁止在 EXCEPTION 子事务里执行 `ALTER TYPE ... ADD VALUE`
 *
 * 背景（CLAUDE.md 数据库变更红线 + 诊断报告 B0#1）：
 *   `DO $$ BEGIN ... EXCEPTION ... END $$` 会创建 PostgreSQL 子事务，
 *   而 `ALTER TYPE ... ADD VALUE` 不允许在子事务中执行 —— 在非 baseline
 *   库上 `prisma migrate deploy` 必然失败，enum 静默缺失导致运行时 invalid enum。
 *
 *   正确写法：直接 `ALTER TYPE "X" ADD VALUE IF NOT EXISTS 'Y';`（顶层语句，幂等）。
 *
 * 看护范围：仅拦截 `ALTER TYPE ... ADD VALUE` 被 `DO $$ ... END $$`（含 EXCEPTION）
 *   包裹的情况。其它 DDL（如 `ADD CONSTRAINT ... EXCEPTION WHEN duplicate_object`
 *   做 FK 幂等）是合法模式，不在拦截范围。
 *
 * Allowlist：截至诊断基线，盘上已有 18 个历史迁移违反此规则。它们已在生产应用、
 *   无法重跑，重写风险高且无收益，故列为冻结 baseline。**新增迁移必须为零违规。**
 *   新写迁移踩坑 → 本 spec 在 jest / pre-push / CI 阶段拦截（honor-only 升级为机器看护）。
 */

import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_ROOT = path.resolve(
  __dirname,
  "../../../../prisma/migrations",
);

/**
 * 冻结的历史违规 baseline（已应用于生产，无法重跑，不强制重写）。
 * 不得新增条目 —— 新迁移一律走顶层 `ADD VALUE IF NOT EXISTS`。
 */
const FROZEN_LEGACY_VIOLATIONS: ReadonlySet<string> = new Set([
  "20251123_add_data_collection_tables",
  "20251126_add_all_ai_mention_type",
  "20260101_add_wechat_data_source",
  "20260103_add_mission_export_source",
  "20260113180000_ensure_research_tables",
  "20260113_fix_enum_values",
  "20260114000000_add_phase3_optimization",
  "20260126_add_slides_v5_tables",
  "20260213_add_export_source_types",
  "20260213_add_export_topic_report_type",
  "20260217_add_finance_secret_category",
  "20260221_add_ai_planning_credit_type",
  "20260227_add_explore_credit_type",
  "20260303_add_code_model_type",
  "20260308_add_academic_weather_secret_categories",
  "20260313_add_image_search_secret_category",
  "20260509a_llm_wiki_init",
  "20260513_wiki_multi_pass_config",
]);

/** 找出所有 `DO $$ ... END $$` 块（大小写不敏感，跨行）。 */
function extractDoBlocks(sql: string): string[] {
  const re = /DO\s+\$\$[\s\S]*?END\s+\$\$/gi;
  return sql.match(re) ?? [];
}

/** 某个 DO 块是否在子事务里执行 `ALTER TYPE ... ADD VALUE`。 */
function blockHasAlterTypeAddValue(block: string): boolean {
  const hasException = /\bEXCEPTION\b/i.test(block);
  const hasAlterTypeAddValue = /ALTER\s+TYPE[\s\S]*?ADD\s+VALUE/i.test(block);
  return hasException && hasAlterTypeAddValue;
}

/** 列出每个迁移目录下的 migration.sql。 */
function listMigrationSqlFiles(): { name: string; file: string }[] {
  if (!fs.existsSync(MIGRATIONS_ROOT)) return [];
  const out: { name: string; file: string }[] = [];
  for (const entry of fs.readdirSync(MIGRATIONS_ROOT, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(MIGRATIONS_ROOT, entry.name, "migration.sql");
    if (fs.existsSync(file)) out.push({ name: entry.name, file });
  }
  return out;
}

describe("迁移卫生：ALTER TYPE ADD VALUE 不得包在 EXCEPTION 子事务", () => {
  const migrations = listMigrationSqlFiles();

  it("能找到迁移目录（防止路径漂移导致 spec 空跑）", () => {
    expect(migrations.length).toBeGreaterThan(0);
  });

  it("没有【新增】迁移把 ALTER TYPE ADD VALUE 包进 DO/EXCEPTION 块", () => {
    const newViolations: string[] = [];

    for (const { name, file } of migrations) {
      if (FROZEN_LEGACY_VIOLATIONS.has(name)) continue;
      const sql = fs.readFileSync(file, "utf-8");
      const offending = extractDoBlocks(sql).some(blockHasAlterTypeAddValue);
      if (offending) newViolations.push(name);
    }

    expect(newViolations).toEqual([]);
  });

  it("冻结 baseline 仍然准确（违规消失了就从 allowlist 移除，避免列表腐化）", () => {
    const stillViolating = new Set<string>();
    for (const { name, file } of migrations) {
      const sql = fs.readFileSync(file, "utf-8");
      if (extractDoBlocks(sql).some(blockHasAlterTypeAddValue)) {
        stillViolating.add(name);
      }
    }
    // baseline 里列出的每一项都应仍然真实违规；否则说明已被修掉，应从 allowlist 删除。
    const staleAllowlistEntries = [...FROZEN_LEGACY_VIOLATIONS].filter(
      (name) => !stillViolating.has(name),
    );
    expect(staleAllowlistEntries).toEqual([]);
  });
});
