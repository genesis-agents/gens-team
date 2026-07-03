/**
 * deep-insight-prompt-policy.ts —— L3 W1 批 3c 步骤⑥：deep-insight 能力接
 * playground 同组 SKILL.md prompt policy key（设计稿 §八「跨模块读同组 key」，
 * 灰度捆绑已拍板：同产品两货架，开 playground 白名单同时点亮 marketplace 面）。
 *
 * 为什么不 import playground 的 playground-prompt-policy 而是能力家自持一份：
 * - 能力即产品铁律 R1（capability-isolation.spec）：marketplace/capabilities/**
 *   非测试源码零 app 业务 import —— 不得 import `ai-app/playground/**`；
 * - frontmatter 锁定基准应是**能力家自己的** agents 副本（deep-insight 是
 *   playground 的字节级克隆，7/8 identical；权力边界比对自家代码副本才成立）。
 * 机制 / 装配规则 / 保险丝与 playground 版逐条一致，两份 resolve 的 key 集合由
 * `contracts/__tests__/playground-policy-surface.spec.ts` 断言看护防漂移。
 *
 * leader 显式排除（设计稿 §九.4）：双副本 SKILL.md 已 DIFFERS（playground=
 * 243f64dc… vs deep-insight=134544a7…），拍板前 leader 不接共享 key ——
 * DEEP_INSIGHT_PROMPT_ROLE_IDS 直接不含 leader，该 key 连 resolve 都不发起，
 * leader 恒走能力家本地 SKILL.md 兜底。
 *
 * 保险丝（同 playground 版，设计稿 §八）：
 * - DB 覆盖只作用 skillSpec.systemPrompt；allowedTools / allowedModels /
 *   outputSchema / meta 永远取代码（clone 时原样 spread）。
 * - DB 文档 frontmatter 与能力家代码副本不一致 → 该 key 整体拒绝回代码 + warn。
 * - value 形状经 readSkillDocPolicy 防坏行，safeParse 失败 fail-open 回代码。
 * - 快照全空 → applyDeepInsightPromptOverlay 返回原对象引用（toBe 级零下降），
 *   绝不回写 DEEP_INSIGHT_PIPELINE / registry 注册件。
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

const logger = new Logger("DeepInsightPromptPolicy");

// 能力家自己的 agents 副本（recipe/ → ../agents/），frontmatter 锁定的比对基准。
const AGENTS_ROOT_DIR = path.resolve(__dirname, "..", "agents");

/** deep-insight 接入的角色集合 = 8 角色减 leader（缓接，见文件头） */
export const DEEP_INSIGHT_PROMPT_ROLE_IDS: ReadonlyArray<PlaygroundSkillRoleId> =
  PLAYGROUND_SKILL_ROLE_IDS.filter((roleId) => roleId !== "leader");

interface PromptOverlayEntry {
  readonly systemPrompt: string;
  readonly resolution: PromptResolution;
}

// 模块级快照：仅 refreshDeepInsightPromptOverlay 整体换引用（run() 启动时序），
// 测试用 __reset 防跨用例污染（Claude Code 反向洞察 #8）
let overlay: ReadonlyMap<PlaygroundSkillRoleId, PromptOverlayEntry> = new Map();

/**
 * run() 启动时刷新 prompt overlay 快照：resolve 7 个（减 leader）
 * `playground.prompt.skill.<roleId>` key，逐 key 形状校验 + SKILL.md 解析 +
 * frontmatter 锁定；任一环节失败该 key 回代码（fail-open），不阻断其余 key。
 * DB 全空 / flag 关 → 快照清空（apply 返回原引用，行为逐字节等同现状）。
 */
export async function refreshDeepInsightPromptOverlay(
  policyConfig: PolicyConfigService,
): Promise<void> {
  const next = new Map<PlaygroundSkillRoleId, PromptOverlayEntry>();
  for (const roleId of DEEP_INSIGHT_PROMPT_ROLE_IDS) {
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
 *   仅替换 systemPrompt；其余字段原引用 spread（永远取代码，保险丝）
 */
export function applyDeepInsightPromptOverlay(
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
 * 未覆盖（走代码 SKILL.md）/ leader（显式排除）→ null。
 */
export function getDeepInsightPromptResolution(
  roleId: PlaygroundSkillRoleId,
): PromptResolution | null {
  return overlay.get(roleId)?.resolution ?? null;
}

/** 测试专用：重置模块级快照，防跨用例状态污染 */
export function __resetDeepInsightPromptOverlayForTest(): void {
  overlay = new Map();
}

// ==================== internals ====================

/**
 * 解析 DB SKILL.md 原文 → frontmatter 锁定比对（基准 = 能力家 agents 副本）→
 * 重建 systemPrompt。装配规则与 recipe buildSkillSpecFromMd 逐字节一致：
 * soul + duties（按 frontmatter 顺序）用 "\n\n---\n\n" 拼接。
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
