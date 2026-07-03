/**
 * prompt-policy.contract.ts —— canonical prompt 策略的 value 形状契约（L3 W1 批 3b）
 *
 * 设计稿：docs/architecture/policy-config-design.md §八。
 *
 * 两类 PROMPT 策略 value 形状（同名概念全项目唯一，禁止各模块再私有定义）：
 * - SkillDocPolicyValue：canonical 载体 = SKILL.md 原文（playground 8 角色，
 *   key = `playground.prompt.skill.<roleId>`）。schemaVersion 必填 literal 1。
 * - PromptTemplatePolicyValue：insight 老代 4 key 的形状上提（冻结，禁止新增
 *   该形状的 key）。已入库行无 schemaVersion 字段，故 optional 保 verbatim 兼容。
 *
 * 保险丝（§八）：SkillDoc 的 DB 覆盖只作用 skillSpec.systemPrompt；
 * allowedTools/allowedModels/outputSchema/meta 永远取代码——形状校验在此，
 * frontmatter 一致性校验在消费侧（步骤④ applyMissionPolicyOverlay）。
 *
 * read* 函数：Zod safeParse 失败返回 null，调用方 fail-open 回代码常量。
 */

import { createHash } from "crypto";
import { z } from "zod";

// ============================================================
// hashPrompt（自 insight/prompts/prompt-version.ts 迁入，实现逐字节不变）
// ============================================================

/**
 * 计算 prompt 的稳定哈希（sha256 utf8 前 16 hex 字符）。
 * 用于 prompt telemetry 溯源与 SKILL.md 双副本漂移守护。
 */
export function hashPrompt(template: string): string {
  return createHash("sha256")
    .update(template, "utf8")
    .digest("hex")
    .slice(0, 16);
}

// ============================================================
// PROMPT 策略 value 形状
// ============================================================

/** canonical 载体 = SKILL.md 原文（frontmatter + 正文一体，不发明第三种格式） */
export const SkillDocPolicyValueSchema = z.object({
  schemaVersion: z.literal(1),
  markdown: z.string().min(1),
});

export type SkillDocPolicyValue = z.infer<typeof SkillDocPolicyValueSchema>;

/**
 * insight 老代纯模板形状（冻结）。已入库行 value = { template } 无
 * schemaVersion，故 optional——对存量行 verbatim 兼容，不做数据迁移。
 */
export const PromptTemplatePolicyValueSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  template: z.string().min(1),
});

export type PromptTemplatePolicyValue = z.infer<
  typeof PromptTemplatePolicyValueSchema
>;

/** safeParse 失败返回 null（调用方 fail-open 回代码副本） */
export function readSkillDocPolicy(value: unknown): SkillDocPolicyValue | null {
  const parsed = SkillDocPolicyValueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** safeParse 失败返回 null（调用方 fail-open 回代码常量） */
export function readPromptTemplatePolicy(
  value: unknown,
): PromptTemplatePolicyValue | null {
  const parsed = PromptTemplatePolicyValueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// ============================================================
// prompt 解析溯源（W2 telemetry 对接的最小快照形状）
// ============================================================

/** 一次 prompt 取值的溯源快照：来自哪个 key、DB 还是代码、哪个版本、什么内容 */
export interface PromptResolution {
  key: string;
  source: "db" | "code";
  /** 仅 source="db" 时存在（policy_configs 行版本） */
  version?: number;
  /** 实际生效文本的 hashPrompt 值（db/code 两源均计算，保证可比对） */
  contentHash: string;
}

// ============================================================
// playground skill prompt key 空间
// ============================================================

/** playground mission 8 角色（deep-insight 跨模块读同组 key；leader 缓接，见设计稿 §九.4） */
export const PLAYGROUND_SKILL_ROLE_IDS = [
  "leader",
  "researcher",
  "reconciler",
  "analyst",
  "writer",
  "reviewer",
  "verifier",
  "steward",
] as const;

export type PlaygroundSkillRoleId = (typeof PLAYGROUND_SKILL_ROLE_IDS)[number];

/** key 格式：`playground.prompt.skill.<roleId>`（符合 POLICY_KEY_PATTERN 三段+） */
export function playgroundSkillPromptKey(
  roleId: PlaygroundSkillRoleId,
): string {
  return `playground.prompt.skill.${roleId}`;
}

// ============================================================
// playground policy surface（设计稿 §八：W3 提议器 v1 的权威范围表）
// ============================================================

/**
 * 策略面条目。kind 与 Prisma `PolicyKind` 枚举字面量对齐（契约保持零 Prisma
 * 依赖，用字面量 union）。
 *
 * efficacy 语义：
 * - `live`       —— DB activate 后 mission 行为即时变化（存在运行时消费面）
 * - `soul-inert` —— 当前无运行时消费面：skillSpec.systemPrompt 不被任何
 *                    primitive 读取，activate 只改"灵魂文本"不改行为
 *                    （编码统一 + 二期铺路）。W3 提议器 v1 只许写 live 条目。
 */
export interface PolicySurfaceEntry {
  readonly key: string;
  readonly kind: "PROMPT" | "THRESHOLD";
  readonly efficacy: "live" | "soul-inert";
}

/**
 * prompt key 的 efficacy 实测依据（2026-07-02，一致性由
 * `__tests__/playground-policy-surface.spec.ts` 从 pipeline 实际结构推导守护）：
 *
 * - 仅 plan / assess / signoff 三个 harness stage primitive 消费
 *   `role.skillSpec.systemPrompt`（plan.primitive.ts / assess.primitive.ts /
 *   signoff.primitive.ts 把它作为 prompt 传入 hooks.runRole）；
 * - PLAYGROUND_PIPELINE 中这三个 primitive 的 roleId 全部 = leader
 *   （s2 / s4 / s10）→ 仅 leader 标 live；
 * - 其余 7 角色的运行时 prompt 主体在各 stage 执行面（duty 渲染
 *   buildPromptFromDuty / @DefineAgent buildSystemPrompt()），
 *   skillSpec.systemPrompt 不被消费 → soul-inert。
 */
const LIVE_PROMPT_ROLE_IDS: ReadonlySet<PlaygroundSkillRoleId> = new Set([
  "leader",
]);

/**
 * playground 策略面全量枚举：8 个 SKILL.md prompt key（批 3c）+ 既有运行时
 * 策略阈值 key（批 2c，playground-strategy-policy.ts 消费，activate 即时生效）。
 */
export const PLAYGROUND_POLICY_SURFACE: ReadonlyArray<PolicySurfaceEntry> = [
  {
    key: "playground.threshold.runtime-strategy",
    kind: "THRESHOLD",
    efficacy: "live",
  },
  ...PLAYGROUND_SKILL_ROLE_IDS.map(
    (roleId): PolicySurfaceEntry => ({
      key: playgroundSkillPromptKey(roleId),
      kind: "PROMPT",
      efficacy: LIVE_PROMPT_ROLE_IDS.has(roleId) ? "live" : "soul-inert",
    }),
  ),
];
