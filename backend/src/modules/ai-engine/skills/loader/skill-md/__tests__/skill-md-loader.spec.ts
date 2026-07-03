/**
 * skill-md-loader.spec.ts — loadSkillFromString 与文件加载路径产物一致性守护
 *
 * W0 policy-config 步骤 3：loadSkillFromString(markdown) 是 DB 覆盖 prompt 的
 * canonical 解析入口（canonical 载体 = SKILL.md 原文）。本 spec 对 playground
 * mission 的 8 个 agent SKILL.md 逐个断言：
 *
 *   loadSkillFromString(readFileSync(x)) deep-equal loadSkill(agentDir, root)
 *
 * 保证 DB 原文走 loadSkillFromString 与代码文件走 loadSkill 产出完全同形
 * （frontmatter / soul / duties 全字段），零漂移。
 *
 * 注：本文件只以 fs 读 ai-app 的 SKILL.md 作 fixture，不 import ai-app 代码，
 * 不违反 L2 → L3 边界（arch spec 只扫 import 语句且排除 __tests__）。
 */

import * as fs from "fs";
import * as path from "path";
import {
  loadSkill,
  loadSkillFromString,
  clearSkillCache,
} from "../skill-md-loader";

const PLAYGROUND_AGENTS_ROOT = path.resolve(
  __dirname,
  "../../../../../ai-app/playground/mission/agents",
);

const PLAYGROUND_AGENT_DIRS = [
  "leader",
  "researcher",
  "reconciler",
  "analyst",
  "writer",
  "reviewer",
  "verifier",
  "steward",
] as const;

describe("loadSkillFromString", () => {
  beforeEach(() => {
    clearSkillCache();
  });

  it("agents root fixture 目录存在（路径漂移时先修这里）", () => {
    expect(fs.existsSync(PLAYGROUND_AGENTS_ROOT)).toBe(true);
  });

  describe.each(PLAYGROUND_AGENT_DIRS)("playground agent %s", (agentDir) => {
    it("loadSkillFromString(原文) 与 loadSkill(文件) 产物 deep-equal", () => {
      const filePath = path.resolve(
        PLAYGROUND_AGENTS_ROOT,
        agentDir,
        "SKILL.md",
      );
      expect(fs.existsSync(filePath)).toBe(true);

      const raw = fs.readFileSync(filePath, "utf8");
      const fromString = loadSkillFromString(raw);
      const fromFile = loadSkill(agentDir, PLAYGROUND_AGENTS_ROOT);

      expect(fromString).toEqual(fromFile);
      // 基本形状再锚一遍：frontmatter.id 非空 + soul/duties 与文件路径产物同键
      expect(fromString.frontmatter.id.length).toBeGreaterThan(0);
      expect(Object.keys(fromString.duties).sort()).toEqual(
        Object.keys(fromFile.duties).sort(),
      );
    });
  });

  it("缺 frontmatter 的字符串抛错（与 parseSkill 行为一致）", () => {
    expect(() => loadSkillFromString("no frontmatter body")).toThrow(
      /missing YAML frontmatter/,
    );
  });

  it("不落缓存：同一原文两次调用返回独立对象", () => {
    const raw = fs.readFileSync(
      path.resolve(PLAYGROUND_AGENTS_ROOT, "researcher", "SKILL.md"),
      "utf8",
    );
    const a = loadSkillFromString(raw);
    const b = loadSkillFromString(raw);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});
