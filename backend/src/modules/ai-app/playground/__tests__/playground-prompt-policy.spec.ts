/**
 * playground-prompt-policy spec（L3 W1 批 3c 零下降 + 保险丝守护）：
 *
 * ① DB 空 / flag 关 → applyMissionPolicyOverlay(PLAYGROUND_PIPELINE) 返回原对象引用（toBe）
 * ② DB 行 = 代码 SKILL.md 文件原文 → 重建 systemPrompt 与代码构建产物逐字节 ===，
 *    且 allowedToolIds / allowedModels / outputSchema / meta 保持代码原引用（保险丝）
 * ③ frontmatter 篡改（改 allowedTools）→ 该 key 整体拒绝回代码 + warn
 * ④ refresh + apply 前后 PLAYGROUND_PIPELINE 深比较不变（防回写共享常量污染）
 * ⑤ __resetPlaygroundPromptOverlayForTest 防跨用例快照污染
 */

import * as fs from "fs";
import * as path from "path";
import { Logger } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PolicyConfigService } from "../../../platform/facade";
import { POLICY_DB_MODULES_ENV } from "../../../platform/policy-config/abstractions/policy-config.types";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import {
  hashPrompt,
  playgroundSkillPromptKey,
} from "../../contracts/prompt-policy.contract";
import { PLAYGROUND_PIPELINE } from "../runtime/playground.config";
import {
  __resetPlaygroundPromptOverlayForTest,
  applyMissionPolicyOverlay,
  getPlaygroundPromptResolution,
  refreshPlaygroundPromptOverlay,
} from "../runtime/playground-prompt-policy";

const AGENTS_ROOT_DIR = path.resolve(__dirname, "..", "mission", "agents");
const RESEARCHER_KEY = playgroundSkillPromptKey("researcher");

function readCodeSkillMd(roleId: string): string {
  return fs.readFileSync(
    path.resolve(AGENTS_ROOT_DIR, roleId, "SKILL.md"),
    "utf8",
  );
}

describe("playground-prompt-policy (SKILL.md dual-read overlay)", () => {
  const mockPolicyConfigTable = { findFirst: jest.fn() };
  const mockPrisma = { policyConfig: mockPolicyConfigTable };
  let policyConfig: PolicyConfigService;
  let warnSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    delete process.env[POLICY_DB_MODULES_ENV];
    // ⑤ 快照重置：防跨用例状态污染（Claude Code 反向洞察 #8）
    __resetPlaygroundPromptOverlayForTest();
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
  });

  // ── ① 零下降：快照空 → 原对象引用 ────────────────────────────────────

  it("① overlay 从未刷新时 apply 返回原对象引用（toBe）", () => {
    expect(applyMissionPolicyOverlay(PLAYGROUND_PIPELINE)).toBe(
      PLAYGROUND_PIPELINE,
    );
  });

  it("① flag 关时 refresh 不查 DB 且 apply 返回原引用", async () => {
    await refreshPlaygroundPromptOverlay(policyConfig);

    expect(mockPolicyConfigTable.findFirst).not.toHaveBeenCalled();
    expect(applyMissionPolicyOverlay(PLAYGROUND_PIPELINE)).toBe(
      PLAYGROUND_PIPELINE,
    );
  });

  it("① flag 开但 DB 空（8 key 均无 active 行）时 apply 返回原引用", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "playground";
    mockPolicyConfigTable.findFirst.mockResolvedValue(null);

    await refreshPlaygroundPromptOverlay(policyConfig);

    // 8 个 playground.prompt.skill.* key 全部查过 DB
    expect(mockPolicyConfigTable.findFirst).toHaveBeenCalledTimes(8);
    expect(applyMissionPolicyOverlay(PLAYGROUND_PIPELINE)).toBe(
      PLAYGROUND_PIPELINE,
    );
    expect(getPlaygroundPromptResolution("researcher")).toBeNull();
  });

  // ── ② DB 行 = 文件原文 → 重建产物逐字节等同代码构建 ─────────────────

  it("② DB markdown = 代码 SKILL.md 原文时，重建 systemPrompt 与代码构建产物逐字节 ===", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "playground";
    const researcherMd = readCodeSkillMd("researcher");
    mockPolicyConfigTable.findFirst.mockImplementation(
      ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === RESEARCHER_KEY
            ? {
                value: { schemaVersion: 1, markdown: researcherMd },
                version: 3,
                contentHash: "0123456789abcdef",
              }
            : null,
        ),
    );

    await refreshPlaygroundPromptOverlay(policyConfig);
    const overlaid = applyMissionPolicyOverlay(PLAYGROUND_PIPELINE);

    expect(overlaid).not.toBe(PLAYGROUND_PIPELINE);
    const dbRole = overlaid.roles.find((r) => r.id === "researcher");
    const codeRole = PLAYGROUND_PIPELINE.roles.find(
      (r) => r.id === "researcher",
    );
    expect(dbRole).toBeDefined();
    expect(codeRole).toBeDefined();
    // 逐字节 ===（DB 原文 = 文件原文 → 同 parser 同装配规则 → byte-equal）
    expect(dbRole!.skillSpec.systemPrompt).toBe(
      codeRole!.skillSpec.systemPrompt,
    );

    // 保险丝：systemPrompt 之外全部保持代码原引用（DB 无权改）
    expect(dbRole!.skillSpec.allowedToolIds).toBe(
      codeRole!.skillSpec.allowedToolIds,
    );
    expect(dbRole!.skillSpec.allowedModels).toBe(
      codeRole!.skillSpec.allowedModels,
    );
    expect(dbRole!.skillSpec.outputSchema).toBe(
      codeRole!.skillSpec.outputSchema,
    );
    expect(dbRole!.skillSpec.meta).toBe(codeRole!.skillSpec.meta);

    // 只 clone 受影响路径：未命中角色 / steps 保持原引用
    expect(overlaid.roles.find((r) => r.id === "writer")).toBe(
      PLAYGROUND_PIPELINE.roles.find((r) => r.id === "writer"),
    );
    expect(overlaid.steps).toBe(PLAYGROUND_PIPELINE.steps);

    // W2 溯源挂点：PromptResolution 记录 db 来源 + 版本 + markdown contentHash
    expect(getPlaygroundPromptResolution("researcher")).toEqual({
      key: RESEARCHER_KEY,
      source: "db",
      version: 3,
      contentHash: hashPrompt(researcherMd),
    });
  });

  // ── ③ frontmatter 锁定：篡改 allowedTools → 整 key 拒绝 + warn ───────

  it("③ DB 文档 frontmatter 改 allowedTools → 该 key 整体拒绝回代码 + warn", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "playground";
    const tampered = readCodeSkillMd("researcher").replace(
      /^allowedTools:.*$/m,
      'allowedTools: ["shell-exec"]',
    );
    mockPolicyConfigTable.findFirst.mockImplementation(
      ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === RESEARCHER_KEY
            ? {
                value: { schemaVersion: 1, markdown: tampered },
                version: 1,
                contentHash: "0123456789abcdef",
              }
            : null,
        ),
    );

    await refreshPlaygroundPromptOverlay(policyConfig);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("frontmatter differs"),
    );
    // 被拒 key 不进快照 → 行为 = 纯代码 SKILL.md（原引用级零下降）
    expect(applyMissionPolicyOverlay(PLAYGROUND_PIPELINE)).toBe(
      PLAYGROUND_PIPELINE,
    );
    expect(getPlaygroundPromptResolution("researcher")).toBeNull();
  });

  it("③b value 形状非法（缺 schemaVersion）→ fail-open 回代码 + warn", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "playground";
    mockPolicyConfigTable.findFirst.mockImplementation(
      ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === RESEARCHER_KEY
            ? {
                value: { markdown: readCodeSkillMd("researcher") },
                version: 1,
                contentHash: "0123456789abcdef",
              }
            : null,
        ),
    );

    await refreshPlaygroundPromptOverlay(policyConfig);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("value malformed"),
    );
    expect(applyMissionPolicyOverlay(PLAYGROUND_PIPELINE)).toBe(
      PLAYGROUND_PIPELINE,
    );
  });

  // ── ④ 防回写污染：refresh + apply 前后共享常量深比较不变 ─────────────

  it("④ refresh + apply 前后 PLAYGROUND_PIPELINE 深比较不变（绝不回写共享常量）", async () => {
    const beforeJson = JSON.stringify(PLAYGROUND_PIPELINE);
    const beforeResearcherPrompt = PLAYGROUND_PIPELINE.roles.find(
      (r) => r.id === "researcher",
    )!.skillSpec.systemPrompt;

    process.env[POLICY_DB_MODULES_ENV] = "playground";
    const researcherMd = readCodeSkillMd("researcher");
    mockPolicyConfigTable.findFirst.mockImplementation(
      ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === RESEARCHER_KEY
            ? {
                value: {
                  schemaVersion: 1,
                  markdown: researcherMd.replace(
                    "# 你是 Researcher",
                    "# 你是 Researcher（DB 覆盖版）",
                  ),
                },
                version: 2,
                contentHash: "0123456789abcdef",
              }
            : null,
        ),
    );

    await refreshPlaygroundPromptOverlay(policyConfig);
    const overlaid = applyMissionPolicyOverlay(PLAYGROUND_PIPELINE);

    // 覆盖生效在副本上……
    expect(
      overlaid.roles.find((r) => r.id === "researcher")!.skillSpec.systemPrompt,
    ).toContain("DB 覆盖版");
    // ……共享常量逐字节原样（引用 + 深比较双守护）
    expect(
      PLAYGROUND_PIPELINE.roles.find((r) => r.id === "researcher")!.skillSpec
        .systemPrompt,
    ).toBe(beforeResearcherPrompt);
    expect(JSON.stringify(PLAYGROUND_PIPELINE)).toBe(beforeJson);
  });

  // ── ⑤ __reset 防跨用例污染 ───────────────────────────────────────────

  it("⑤ __reset 后快照清空，apply 回到原引用", async () => {
    process.env[POLICY_DB_MODULES_ENV] = "playground";
    const researcherMd = readCodeSkillMd("researcher");
    mockPolicyConfigTable.findFirst.mockImplementation(
      ({ where }: { where: { key: string } }) =>
        Promise.resolve(
          where.key === RESEARCHER_KEY
            ? {
                value: { schemaVersion: 1, markdown: researcherMd },
                version: 1,
                contentHash: "0123456789abcdef",
              }
            : null,
        ),
    );
    await refreshPlaygroundPromptOverlay(policyConfig);
    expect(applyMissionPolicyOverlay(PLAYGROUND_PIPELINE)).not.toBe(
      PLAYGROUND_PIPELINE,
    );

    __resetPlaygroundPromptOverlayForTest();

    expect(applyMissionPolicyOverlay(PLAYGROUND_PIPELINE)).toBe(
      PLAYGROUND_PIPELINE,
    );
    expect(getPlaygroundPromptResolution("researcher")).toBeNull();
  });

  // leader 缓接（设计稿 §九.4）：playground 与 deep-insight 双份 leader SKILL.md
  // 已 DIFFERS，共享 key `playground.prompt.skill.leader` 的漂移守护与接入
  // 待开放点拍板后再补 —— 此处占位防遗忘，不做任何断言。
  it.skip("leader 角色共享 key 漂移守护（已 DIFFERS，待开放点拍板）", () => {
    // intentionally skipped
  });
});
