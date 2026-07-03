/**
 * playground-prompt-policy.ts —— L3 W1 批 3c：playground 8 角色 SKILL.md prompt
 * 的 dual-read overlay（canonical 载体 = SKILL.md 原文，设计稿 §八）
 *
 * 形态与 playground-strategy-policy.ts 同款：mission 启动时（dispatcher.runMission
 * 起点，async + DI 可用）refreshPlaygroundPromptOverlay 刷一次模块级快照；
 * applyMissionPolicyOverlay 是纯函数，把快照叠加到 per-mission pipeline config
 * 副本上（只 clone 受影响路径），**绝不回写** PLAYGROUND_PIPELINE / registry /
 * catalog / dag-view。快照全空 → 返回原对象引用（零下降，spec 用 toBe 守护）。
 *
 * 保险丝（设计稿 §八，权力边界）：
 * - DB 覆盖只作用 skillSpec.systemPrompt；allowedTools / allowedModels /
 *   outputSchema / meta 永远取代码（clone 时原样 spread，不从 DB 文档重建）。
 * - frontmatter 锁定：DB 文档 frontmatter 与代码侧该角色 SKILL.md 的 frontmatter
 *   不一致（比如试图改 allowedTools）→ 该 key **整体拒绝**回代码 + warn。
 *   校验在 refresh 时做（代码侧 SKILL.md 静态），被拒 key 不进快照，
 *   applyMissionPolicyOverlay 无需重复校验。
 * - value 形状（{ schemaVersion: 1, markdown }）经 readSkillDocPolicy 防坏行，
 *   safeParse 失败 → fail-open 回代码。
 *
 * 溯源（W2 对接点）：每个生效覆盖的 PromptResolution 存快照，
 * getPlaygroundPromptResolution(roleId) 暴露给 telemetry —— 不塞进
 * ISkillExecSpec.meta（该类型闭合，engine 层不为 app 层扩字段）。
 */

import * as path from "path";
import { Logger } from "@nestjs/common";
import type { PolicyConfigService } from "@/modules/platform/facade";
import type { MissionPipelineConfig } from "@/modules/ai-harness/facade";
import { loadSkill, loadSkillFromString } from "@/modules/ai-engine/facade";
import {
  PLAYGROUND_SKILL_ROLE_IDS,
  hashPrompt,
  playgroundSkillPromptKey,
  readSkillDocPolicy,
  type PlaygroundSkillRoleId,
  type PromptResolution,
} from "@/modules/ai-app/contracts/prompt-policy.contract";

const logger = new Logger("PlaygroundPromptPolicy");

// 与 runtime/playground.config.ts 的 AGENTS_ROOT_DIR 同表达式（同目录层级）：
// runtime/ → ../mission/agents/（代码侧 SKILL.md 单源，frontmatter 锁定的比对基准）
const AGENTS_ROOT_DIR = path.resolve(__dirname, "..", "mission", "agents");

interface PromptOverlayEntry {
  /** 从 DB SKILL.md 原文重建的 systemPrompt（与 buildSkillSpecFromMd 同装配规则） */
  readonly systemPrompt: string;
  /** W2 telemetry 溯源快照（contentHash = DB markdown 原文的 hashPrompt） */
  readonly resolution: PromptResolution;
}

// 模块级快照：仅 refreshPlaygroundPromptOverlay 整体换引用（mission 启动时序），
// 测试用 __reset 防跨用例污染（Claude Code 反向洞察 #8）
let overlay: ReadonlyMap<PlaygroundSkillRoleId, PromptOverlayEntry> = new Map();

/**
 * mission 启动时刷新 prompt overlay 快照：resolve 8 个
 * `playground.prompt.skill.<roleId>` key，逐 key 做形状校验 + SKILL.md 解析 +
 * frontmatter 锁定；任一环节失败该 key 回代码（fail-open），不阻断其余 key。
 * DB 全空 / flag 关 → 快照清空（apply 返回原引用，行为逐字节等同现状）。
 */
export async function refreshPlaygroundPromptOverlay(
  policyConfig: PolicyConfigService,
): Promise<void> {
  const next = new Map<PlaygroundSkillRoleId, PromptOverlayEntry>();
  for (const roleId of PLAYGROUND_SKILL_ROLE_IDS) {
    const key = playgroundSkillPromptKey(roleId);
    try {
      const resolution = await policyConfig.resolve<unknown>(key, null);
      if (resolution.source === "code" || resolution.value == null) continue;
      const doc = readSkillDocPolicy(resolution.value);
      if (!doc) {
        logger.warn(
          `Policy "${key}" v${resolution.version} value malformed ` +
            `(expected { schemaVersion: 1, markdown }), falling back to code SKILL.md`,
        );
        continue;
      }
      const systemPrompt = rebuildSystemPromptFromDbDoc(
        roleId,
        key,
        doc.markdown,
        resolution.version,
      );
      if (systemPrompt == null) continue; // 已 warn，回代码
      next.set(roleId, {
        systemPrompt,
        resolution: {
          key,
          source: "db",
          version: resolution.version,
          contentHash: hashPrompt(doc.markdown),
        },
      });
    } catch (err) {
      // PolicyConfigService.resolve 内部已 fail-open；此 catch 兜住解析层意外，
      // 保证单 key 异常不影响其余角色。
      logger.warn(
        `Policy "${key}" refresh failed, falling back to code SKILL.md: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  overlay = next;
  if (next.size > 0) {
    logger.log(
      `Prompt overlay active for roles: ${[...next.keys()].join(", ")}`,
    );
  }
}

/**
 * 把 prompt overlay 叠加到 pipeline config 上（纯函数）：
 * - 快照全空 → 返回**原对象引用**（toBe 级零下降承诺）
 * - 命中角色 → 只 clone config → roles → 该 role → skillSpec 路径，
 *   仅替换 systemPrompt；allowedToolIds / allowedModels / outputSchema / meta
 *   原引用 spread（永远取代码，保险丝）
 * - 全部命中 key 在 refresh 已被拒 → 快照空 → 同样返回原引用
 */
export function applyMissionPolicyOverlay(
  config: MissionPipelineConfig,
): MissionPipelineConfig {
  if (overlay.size === 0) return config;

  let changed = false;
  const roles = config.roles.map((role) => {
    const entry = overlay.get(role.id as PlaygroundSkillRoleId);
    if (!entry) return role;
    changed = true;
    return {
      ...role,
      skillSpec: {
        ...role.skillSpec,
        systemPrompt: entry.systemPrompt,
      },
    };
  });
  if (!changed) return config;
  return { ...config, roles };
}

/**
 * W2 telemetry 溯源挂点：某角色当前生效的 DB prompt 覆盖溯源。
 * 未覆盖（走代码 SKILL.md）→ null。
 */
export function getPlaygroundPromptResolution(
  roleId: PlaygroundSkillRoleId,
): PromptResolution | null {
  return overlay.get(roleId)?.resolution ?? null;
}

/** 测试专用：重置模块级快照，防跨用例状态污染 */
export function __resetPlaygroundPromptOverlayForTest(): void {
  overlay = new Map();
}

// ==================== internals ====================

/**
 * 解析 DB SKILL.md 原文 → frontmatter 锁定比对 → 重建 systemPrompt。
 * 装配规则与 playground.config.ts buildSkillSpecFromMd 逐字节一致：
 * soul + duties（按 frontmatter 顺序）用 "\n\n---\n\n" 拼接 ——
 * DB 行 = 文件原文时产物与代码构建产物 byte-equal（spec 守护）。
 *
 * 任一失败返回 null（调用方跳过该 key，回代码）。
 */
function rebuildSystemPromptFromDbDoc(
  roleId: PlaygroundSkillRoleId,
  key: string,
  markdown: string,
  version: number | undefined,
): string | null {
  let dbSkill;
  try {
    dbSkill = loadSkillFromString(markdown);
  } catch (err) {
    logger.warn(
      `Policy "${key}" v${version} SKILL.md parse failed, ` +
        `falling back to code: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
  let codeSkill;
  try {
    codeSkill = loadSkill(roleId, AGENTS_ROOT_DIR);
  } catch (err) {
    logger.warn(
      `Policy "${key}": code-side SKILL.md load failed (cannot verify ` +
        `frontmatter lock), falling back to code: ${
          err instanceof Error ? err.message : String(err)
        }`,
    );
    return null;
  }
  // frontmatter 锁定：两侧同 parser 构造（字段顺序稳定），JSON 串比对可靠。
  // 不一致 = DB 文档试图改 allowedTools / allowedModels / duties 等权力边界 → 整体拒绝。
  if (
    JSON.stringify(dbSkill.frontmatter) !==
    JSON.stringify(codeSkill.frontmatter)
  ) {
    logger.warn(
      `Policy "${key}" v${version} rejected: DB SKILL.md frontmatter differs ` +
        `from code copy (prompt policy may only change prose, not ` +
        `allowedTools/allowedModels/duties). Falling back to code SKILL.md.`,
    );
    return null;
  }
  const sections: string[] = [];
  if (dbSkill.soul) sections.push(dbSkill.soul);
  for (const dutyName of dbSkill.frontmatter.duties) {
    sections.push(dbSkill.duties[dutyName]);
  }
  return sections.join("\n\n---\n\n");
}
