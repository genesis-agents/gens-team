/**
 * playground SKILL.md prompt 策略 backfill — L3-W1 批 3b 步骤 7（2026-07-02）
 *
 * 把 8 个 playground 角色的 SKILL.md 原文 propose 进 policy_configs
 * （key: playground.prompt.skill.<roleId>，kind=PROMPT，version=1），**不激活**——
 * 激活是人工灰度闸：staging 开 POLICY_DB_MODULES=playground 后逐 key activate，
 * 真跑 mission + rollback 演练（设计稿 §八 步骤 7）。
 *
 * 幂等：key 已有任何版本行则跳过（不重复 backfill）。
 * 审计：changeReason 记源文件相对路径 + markdown sha256-16 + frontmatter version；
 *       --by 必填（W1 只有人写，禁止匿名变更）。
 *
 * 用法：
 *   本地/生产: npx tsx scripts/maintenance/backfill-playground-prompt-policies.ts \
 *              --by human:you@example.com [--dry-run]
 */

import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ROLE_IDS = [
  "leader",
  "researcher",
  "reconciler",
  "analyst",
  "writer",
  "reviewer",
  "verifier",
  "steward",
] as const;

const AGENTS_ROOT = join(
  __dirname,
  "../../src/modules/ai-app/playground/mission/agents",
);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? "true") : undefined;
}

/** 与 contracts/prompt-policy.contract.ts 的 hashPrompt 同语义（sha256 utf8 前 16 hex） */
function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/** 与 PolicyConfigService.hashValue 同语义（对 value JSON 串哈希） */
function hashValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

function frontmatterVersion(markdown: string): string {
  const m = markdown.match(/^---[\s\S]*?^version:\s*["']?([\w.-]+)["']?\s*$/m);
  return m?.[1] ?? "unknown";
}

async function main(): Promise<void> {
  const by = arg("by");
  const dryRun = arg("dry-run") !== undefined;
  if (!by || !/^human:/.test(by)) {
    console.error(
      "ERROR: --by human:<email> 必填（W1 只有人写，审计链不接受匿名变更）",
    );
    process.exit(1);
  }

  let created = 0;
  let skipped = 0;
  for (const roleId of ROLE_IDS) {
    const key = `playground.prompt.skill.${roleId}`;
    const file = join(AGENTS_ROOT, roleId, "SKILL.md");
    const markdown = readFileSync(file, "utf8");
    const value = { schemaVersion: 1, markdown };
    const changeReason =
      `backfill from src/modules/ai-app/playground/mission/agents/${roleId}/SKILL.md ` +
      `(markdown sha256-16 ${hashText(markdown)}, frontmatter version ${frontmatterVersion(markdown)})`;

    const existing = await prisma.policyConfig.findFirst({
      where: { key },
      select: { version: true },
    });
    if (existing) {
      console.log(
        `SKIP  ${key} — 已有版本行（v${existing.version}+），幂等跳过`,
      );
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`DRY   ${key} v1 (${changeReason})`);
      created++;
      continue;
    }

    await prisma.policyConfig.create({
      data: {
        key,
        version: 1,
        kind: "PROMPT",
        value,
        contentHash: hashValue(value),
        createdBy: by,
        changeReason,
        // isActive 默认 false —— 不激活，人工灰度闸
      },
    });
    console.log(`OK    ${key} v1 proposed（未激活）`);
    created++;
  }

  console.log(
    `\n完成：${created} proposed${dryRun ? "（dry-run）" : ""}，${skipped} skipped。` +
      `\n激活前置：staging 设 POLICY_DB_MODULES 含 playground → 逐 key 人工 activate → ` +
      `真跑 1 个 mission 验证溯源 source=db → rollback 演练。`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
