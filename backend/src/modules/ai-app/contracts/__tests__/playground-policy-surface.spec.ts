/**
 * PLAYGROUND_POLICY_SURFACE 一致性 spec（L3 W1 批 3c 步骤⑤ + ⑥）
 *
 * A) efficacy 推导一致性：从**实际源码 + 实际 pipeline 结构**推导 live 集合——
 *    扫 ai-harness/teams/services/stages/*.primitive.ts 找真消费
 *    `skillSpec.systemPrompt` 的 primitive，再据 PLAYGROUND_PIPELINE.steps 的
 *    roleId 映射出 live 角色集合，断言与枚举标注逐条一致（防"枚举写 live 实则
 *    inert"的提议器误伤面）。
 * B) key 集合一致性：枚举的 PROMPT key 集合 = playground overlay 实际 resolve
 *    的 key 集合；deep-insight overlay 实际 resolve 的 key 集合 = 枚举 PROMPT
 *    key 减 leader（缓接，设计稿 §九.4）。
 * C) deep-insight overlay 行为（步骤⑥ 零下降 + 保险丝 + leader 排除）。
 * D) 枚举形状：key 唯一 + 符合 POLICY_KEY_PATTERN + THRESHOLD 条目与
 *    playground-strategy-policy 常量一致。
 */

import * as fs from "fs";
import * as path from "path";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PolicyConfigService } from "../../../platform/facade";
import {
  POLICY_DB_MODULES_ENV,
  POLICY_KEY_PATTERN,
} from "../../../platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  PLAYGROUND_POLICY_SURFACE,
  PLAYGROUND_SKILL_ROLE_IDS,
  playgroundSkillPromptKey,
} from "../prompt-policy.contract";
import { PLAYGROUND_PIPELINE } from "../../playground/runtime/playground.config";
import { PLAYGROUND_STRATEGY_POLICY_KEY } from "../../playground/runtime/playground-strategy-policy";
import {
  __resetPlaygroundPromptOverlayForTest,
  refreshPlaygroundPromptOverlay,
} from "../../playground/runtime/playground-prompt-policy";
import { DEEP_INSIGHT_PIPELINE } from "../../marketplace/capabilities/deep-insight/recipe/deep-insight.recipe";
import {
  DEEP_INSIGHT_PROMPT_ROLE_IDS,
  __resetDeepInsightPromptOverlayForTest,
  applyDeepInsightPromptOverlay,
  getDeepInsightPromptResolution,
  refreshDeepInsightPromptOverlay,
} from "../../marketplace/capabilities/deep-insight/recipe/deep-insight-prompt-policy";

const STAGES_DIR = path.resolve(
  __dirname,
  "../../../ai-harness/teams/services/stages",
);

const SURFACE_PROMPT_KEYS = PLAYGROUND_POLICY_SURFACE.filter(
  (e) => e.kind === "PROMPT",
).map((e) => e.key);

/**
 * 实测消费面：stages/ 顶层 *.primitive.ts 中出现 `skillSpec.systemPrompt`
 * 的 primitive（文件名 = primitive id，与 config.steps[].primitive 对齐）。
 */
function promptConsumingPrimitives(): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const f of fs.readdirSync(STAGES_DIR)) {
    if (!f.endsWith(".primitive.ts")) continue;
    const src = fs.readFileSync(path.join(STAGES_DIR, f), "utf8");
    if (/skillSpec\.systemPrompt/.test(src)) {
      ids.add(f.replace(/\.primitive\.ts$/, ""));
    }
  }
  return ids;
}

function readDeepInsightSkillDoc(roleId: string): string {
  return fs.readFileSync(
    path.resolve(
      __dirname,
      "../../marketplace/capabilities/deep-insight/agents",
      roleId,
      "SKILL.md",
    ),
    "utf8",
  );
}

describe("PLAYGROUND_POLICY_SURFACE 一致性（批 3c 步骤⑤/⑥）", () => {
  describe("D) 枚举形状", () => {
    it("key 全局唯一且符合 POLICY_KEY_PATTERN", () => {
      const keys = PLAYGROUND_POLICY_SURFACE.map((e) => e.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) {
        expect(key).toMatch(POLICY_KEY_PATTERN);
      }
    });

    it("THRESHOLD 条目 = 批 2c 既有 strategy key（live）", () => {
      const thresholds = PLAYGROUND_POLICY_SURFACE.filter(
        (e) => e.kind === "THRESHOLD",
      );
      expect(thresholds).toEqual([
        {
          key: PLAYGROUND_STRATEGY_POLICY_KEY,
          kind: "THRESHOLD",
          efficacy: "live",
        },
      ]);
    });

    it("PROMPT 条目 = 8 角色 key（PLAYGROUND_SKILL_ROLE_IDS 全覆盖）", () => {
      expect(new Set(SURFACE_PROMPT_KEYS)).toEqual(
        new Set(PLAYGROUND_SKILL_ROLE_IDS.map(playgroundSkillPromptKey)),
      );
    });
  });

  describe("A) efficacy 推导一致性（源码实测 → pipeline 结构 → 枚举标注）", () => {
    const consuming = promptConsumingPrimitives();
    const liveRoles = new Set(
      PLAYGROUND_PIPELINE.steps
        .filter((s) => s.roleId !== undefined && consuming.has(s.primitive))
        .map((s) => s.roleId as string),
    );

    it("现状锚点：消费 skillSpec.systemPrompt 的 primitive = plan/assess/signoff（变更时必须重估 surface）", () => {
      expect([...consuming].sort()).toEqual(["assess", "plan", "signoff"]);
    });

    it("每个 PROMPT 条目的 efficacy 与 pipeline 推导的 live 集合一致", () => {
      for (const roleId of PLAYGROUND_SKILL_ROLE_IDS) {
        const entry = PLAYGROUND_POLICY_SURFACE.find(
          (e) => e.key === playgroundSkillPromptKey(roleId),
        );
        expect(entry).toBeDefined();
        expect(entry!.kind).toBe("PROMPT");
        expect({ roleId, efficacy: entry!.efficacy }).toEqual({
          roleId,
          efficacy: liveRoles.has(roleId) ? "live" : "soul-inert",
        });
      }
    });
  });

  describe("B/C) overlay resolve key 集合 + deep-insight 行为", () => {
    const mockPolicyConfigTable = { findFirst: jest.fn() };
    const mockPrisma = { policyConfig: mockPolicyConfigTable };
    let policyConfig: PolicyConfigService;
    let warnSpy: jest.SpyInstance;

    /** findFirst 实际被查询过的 key 集合 */
    function queriedKeys(): Set<string> {
      return new Set(
        mockPolicyConfigTable.findFirst.mock.calls.map(
          ([args]: [{ where: { key: string } }]) => args.where.key,
        ),
      );
    }

    beforeEach(async () => {
      jest.clearAllMocks();
      process.env[POLICY_DB_MODULES_ENV] = "playground";
      __resetPlaygroundPromptOverlayForTest();
      __resetDeepInsightPromptOverlayForTest();
      warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();

      const module = await Test.createTestingModule({
        providers: [
          PolicyConfigService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();
      policyConfig = module.get(PolicyConfigService);
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    afterAll(() => {
      delete process.env[POLICY_DB_MODULES_ENV];
      __resetPlaygroundPromptOverlayForTest();
      __resetDeepInsightPromptOverlayForTest();
    });

    it("B) playground overlay 实际 resolve 的 key 集合 = 枚举 PROMPT key 集合", async () => {
      mockPolicyConfigTable.findFirst.mockResolvedValue(null);

      await refreshPlaygroundPromptOverlay(policyConfig);

      expect(queriedKeys()).toEqual(new Set(SURFACE_PROMPT_KEYS));
    });

    it("B) deep-insight overlay 实际 resolve 的 key 集合 = 枚举 PROMPT key 减 leader（缓接）", async () => {
      mockPolicyConfigTable.findFirst.mockResolvedValue(null);

      await refreshDeepInsightPromptOverlay(policyConfig);

      const expected = new Set(
        SURFACE_PROMPT_KEYS.filter(
          (k) => k !== playgroundSkillPromptKey("leader"),
        ),
      );
      expect(queriedKeys()).toEqual(expected);
      // 角色集合口径同款（模块常量与 key 集合双向一致）
      expect(new Set(DEEP_INSIGHT_PROMPT_ROLE_IDS)).toEqual(
        new Set(PLAYGROUND_SKILL_ROLE_IDS.filter((r) => r !== "leader")),
      );
    });

    it("C) DB 空 → applyDeepInsightPromptOverlay 返回原对象引用（toBe 级零下降）", async () => {
      mockPolicyConfigTable.findFirst.mockResolvedValue(null);

      await refreshDeepInsightPromptOverlay(policyConfig);

      expect(applyDeepInsightPromptOverlay(DEEP_INSIGHT_PIPELINE)).toBe(
        DEEP_INSIGHT_PIPELINE,
      );
      expect(getDeepInsightPromptResolution("researcher")).toBeNull();
    });

    it("C) DB researcher 行 = 能力家代码副本原文 → 仅 systemPrompt 替换（保险丝字段原引用）", async () => {
      const researcherKey = playgroundSkillPromptKey("researcher");
      const researcherMd = readDeepInsightSkillDoc("researcher");
      mockPolicyConfigTable.findFirst.mockImplementation(
        ({ where }: { where: { key: string } }) =>
          Promise.resolve(
            where.key === researcherKey
              ? {
                  value: { schemaVersion: 1, markdown: researcherMd },
                  version: 1,
                  contentHash: "0123456789abcdef",
                }
              : null,
          ),
      );

      await refreshDeepInsightPromptOverlay(policyConfig);
      const overlaid = applyDeepInsightPromptOverlay(DEEP_INSIGHT_PIPELINE);

      expect(overlaid).not.toBe(DEEP_INSIGHT_PIPELINE);
      const dbRole = overlaid.roles.find((r) => r.id === "researcher")!;
      const codeRole = DEEP_INSIGHT_PIPELINE.roles.find(
        (r) => r.id === "researcher",
      )!;
      // DB 原文 = 文件原文 → 同 parser 同装配规则 → 逐字节 ===
      expect(dbRole.skillSpec.systemPrompt).toBe(
        codeRole.skillSpec.systemPrompt,
      );
      // 保险丝：systemPrompt 之外全部保持代码原引用（DB 无权改）
      expect(dbRole.skillSpec.allowedToolIds).toBe(
        codeRole.skillSpec.allowedToolIds,
      );
      expect(dbRole.skillSpec.allowedModels).toBe(
        codeRole.skillSpec.allowedModels,
      );
      expect(dbRole.skillSpec.outputSchema).toBe(
        codeRole.skillSpec.outputSchema,
      );
      expect(dbRole.skillSpec.meta).toBe(codeRole.skillSpec.meta);
      // 未命中角色 / steps 保持原引用（只 clone 受影响路径）
      expect(overlaid.roles.find((r) => r.id === "writer")).toBe(
        DEEP_INSIGHT_PIPELINE.roles.find((r) => r.id === "writer"),
      );
      expect(overlaid.steps).toBe(DEEP_INSIGHT_PIPELINE.steps);
    });

    it("C) leader key 即使 DB 有 active 行也不查询、不生效（显式排除）", async () => {
      const leaderKey = playgroundSkillPromptKey("leader");
      mockPolicyConfigTable.findFirst.mockImplementation(
        ({ where }: { where: { key: string } }) =>
          Promise.resolve(
            where.key === leaderKey
              ? {
                  value: {
                    schemaVersion: 1,
                    markdown: readDeepInsightSkillDoc("leader"),
                  },
                  version: 1,
                  contentHash: "0123456789abcdef",
                }
              : null,
          ),
      );

      await refreshDeepInsightPromptOverlay(policyConfig);

      expect(queriedKeys().has(leaderKey)).toBe(false);
      expect(getDeepInsightPromptResolution("leader")).toBeNull();
      expect(applyDeepInsightPromptOverlay(DEEP_INSIGHT_PIPELINE)).toBe(
        DEEP_INSIGHT_PIPELINE,
      );
    });
  });
});
