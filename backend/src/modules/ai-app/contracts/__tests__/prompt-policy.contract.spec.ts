/**
 * prompt-policy.contract 漂移守护 spec（L3 W1 批 3b 步骤②）
 *
 * A) SKILL.md 双副本漂移守护：playground/mission/agents/<role>/SKILL.md 与
 *    marketplace/capabilities/deep-insight/agents/<role>/SKILL.md 逐角色
 *    sha256 相等（deep-insight 是 playground 的字节级克隆，跨模块读同组
 *    policy key，副本漂移 = 灰度时两货架行为分叉）。
 *    实测 2026-07-02：7/8 identical + leader DIFFERS（it.skip 留闸，见下）。
 * B) 8 个 playground SKILL.md 的 hashPrompt 现状锚点：SKILL.md 文本变更时
 *    此处必须同步更新——即 prompt 变更显式化，防止"顺手改 SKILL.md"绕过
 *    changeReason / golden eval 把关。
 * C) hashPrompt 固定样本回归：实现自 insight/prompts/prompt-version.ts 迁入
 *    契约，逐字节不变（sha256 utf8 前 16 hex）——已入库 contentHash 依赖此值。
 * D) 两个 PROMPT 策略 value 形状的 Zod 合法/非法样例。
 */

import { readFileSync } from "fs";
import { join } from "path";
import {
  hashPrompt,
  PLAYGROUND_SKILL_ROLE_IDS,
  playgroundSkillPromptKey,
  readPromptTemplatePolicy,
  readSkillDocPolicy,
} from "../prompt-policy.contract";

const AI_APP_ROOT = join(__dirname, "..", "..");

function readPlaygroundSkillDoc(roleId: string): string {
  return readFileSync(
    join(AI_APP_ROOT, "playground", "mission", "agents", roleId, "SKILL.md"),
    "utf8",
  );
}

function readDeepInsightSkillDoc(roleId: string): string {
  return readFileSync(
    join(
      AI_APP_ROOT,
      "marketplace",
      "capabilities",
      "deep-insight",
      "agents",
      roleId,
      "SKILL.md",
    ),
    "utf8",
  );
}

describe("prompt-policy.contract", () => {
  describe("A) SKILL.md 双副本漂移守护（playground vs deep-insight）", () => {
    const identicalRoles = PLAYGROUND_SKILL_ROLE_IDS.filter(
      (r) => r !== "leader",
    );

    it.each(identicalRoles)(
      "%s：playground 与 deep-insight 副本 sha256 相等",
      (roleId) => {
        expect(hashPrompt(readPlaygroundSkillDoc(roleId))).toBe(
          hashPrompt(readDeepInsightSkillDoc(roleId)),
        );
      },
    );

    // leader 双副本已 DIFFERS（playground=243f64dc3c1bf7f6 vs
    // deep-insight=134544a703f26193，2026-07-02 实测）：以哪版为准 / 有意分叉
    // 待开放点拍板（设计稿 §九.4）。拍板前 leader 不接共享 key，此断言留闸。
    it.skip("leader：待开放点拍板后解闸（当前双副本 DIFFERS）", () => {
      expect(hashPrompt(readPlaygroundSkillDoc("leader"))).toBe(
        hashPrompt(readDeepInsightSkillDoc("leader")),
      );
    });
  });

  describe("B) playground SKILL.md hashPrompt 现状锚点", () => {
    it("8 角色 hash 快照（改 SKILL.md 必须同步更新此锚点）", () => {
      const hashes = Object.fromEntries(
        PLAYGROUND_SKILL_ROLE_IDS.map((roleId) => [
          roleId,
          hashPrompt(readPlaygroundSkillDoc(roleId)),
        ]),
      );
      expect(hashes).toEqual({
        leader: "243f64dc3c1bf7f6",
        researcher: "6af03a8a2bc4f1d3",
        reconciler: "006eac6d00b866d3",
        analyst: "9f3f5a208abcfa68",
        writer: "272f85f69d13c90f",
        reviewer: "1b0be547c575622e",
        verifier: "64e2e271600d08f6",
        steward: "16004c1c466c66b2",
      });
    });
  });

  describe("C) hashPrompt 固定样本回归（迁移前后逐字节不变）", () => {
    it('hashPrompt("hello") 与迁移前实现取值一致', () => {
      // 迁移前 insight/prompts/prompt-version.ts 实现实测值（sha256 utf8 前 16 hex）
      expect(hashPrompt("hello")).toBe("2cf24dba5fb0a30e");
    });

    it("多行输入（换行参与哈希）", () => {
      expect(hashPrompt("hello\nworld")).toBe("26c60a61d01db583");
    });

    it("输出恒为 16 位小写 hex", () => {
      expect(hashPrompt("")).toMatch(/^[0-9a-f]{16}$/);
      expect(hashPrompt("任意中文内容")).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe("D) PROMPT 策略 value 形状", () => {
    describe("readSkillDocPolicy", () => {
      it("合法：schemaVersion=1 + 非空 markdown", () => {
        expect(
          readSkillDocPolicy({ schemaVersion: 1, markdown: "# Role\n正文" }),
        ).toEqual({ schemaVersion: 1, markdown: "# Role\n正文" });
      });

      it("非法：schemaVersion 缺失 / 错值、markdown 缺失 / 空串、非对象 → null", () => {
        expect(readSkillDocPolicy({ markdown: "# Role" })).toBeNull();
        expect(
          readSkillDocPolicy({ schemaVersion: 2, markdown: "# Role" }),
        ).toBeNull();
        expect(readSkillDocPolicy({ schemaVersion: 1 })).toBeNull();
        expect(
          readSkillDocPolicy({ schemaVersion: 1, markdown: "" }),
        ).toBeNull();
        expect(readSkillDocPolicy(null)).toBeNull();
        expect(readSkillDocPolicy("# Role")).toBeNull();
      });
    });

    describe("readPromptTemplatePolicy", () => {
      it("合法：老代入库行形状（无 schemaVersion，verbatim 兼容）", () => {
        expect(readPromptTemplatePolicy({ template: "模板正文" })).toEqual({
          template: "模板正文",
        });
      });

      it("合法：带 schemaVersion=1 的新行", () => {
        expect(
          readPromptTemplatePolicy({ schemaVersion: 1, template: "模板正文" }),
        ).toEqual({ schemaVersion: 1, template: "模板正文" });
      });

      it("非法：template 缺失 / 空串、schemaVersion 错值、非对象 → null", () => {
        expect(readPromptTemplatePolicy({ wrongShape: true })).toBeNull();
        expect(readPromptTemplatePolicy({ template: "" })).toBeNull();
        expect(
          readPromptTemplatePolicy({ schemaVersion: 2, template: "x" }),
        ).toBeNull();
        expect(readPromptTemplatePolicy(null)).toBeNull();
        expect(readPromptTemplatePolicy(undefined)).toBeNull();
      });
    });

    it("playgroundSkillPromptKey 生成设计稿 §八 约定的 key 格式", () => {
      expect(playgroundSkillPromptKey("researcher")).toBe(
        "playground.prompt.skill.researcher",
      );
      // 三段+点分小写（POLICY_KEY_PATTERN 兼容）
      for (const roleId of PLAYGROUND_SKILL_ROLE_IDS) {
        expect(playgroundSkillPromptKey(roleId)).toMatch(
          /^[a-z0-9-]+(\.[a-z0-9-]+){2,}$/,
        );
      }
    });
  });
});
