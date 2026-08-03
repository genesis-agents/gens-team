/**
 * 技能文档 ↔ agent outputSchema 契约看护（全量自动配对）
 *
 * ★ 2026-08-03（Railway 生产日志实证）：挂在 agent 上的 SKILL.md 教的输出 JSON
 *   形状，与该 agent 真实的 outputSchema 是两套东西。模型对文档是**照做**的：
 *
 *     finalize rejected (1/3): Schema: dimension: Required; chapters: Required
 *     finalize rejected 3 times in a row, accepting current candidate to avoid infinite loop
 *     InvalidActionError: LLM returned unsupported action kind: "integrate"
 *     thinking: "...Output exactly the required integrate JSON."
 *
 *   → 必被驳回 → 耗尽重试 → "接受当前候选"兜底塞进垃圾产物。
 *
 *   与本轮章节字数那条是同一个病：**承诺的和执行的不是一回事**。
 *
 * 本套件**自动**扫描所有 `*.agent.ts` 的 `skills: [...]` 声明与 `const Output`
 * schema，逐对比对 —— 刻意不用手写配对表，手写表本身就会漂移（这正是被看护的
 * 那类缺陷）。新增技能 / 改 schema 若造成不一致，这里直接红。
 */

import * as fs from "fs";
import * as path from "path";

const AI_APP_DIR = path.join(__dirname, "..", "..", "..", "..", "..");
const SKILLS_DIR = path.join(__dirname, "..", "..", "..", "skills");

/** ReAct 协议里真实存在的 action kind —— 与 react-loop.normalizeAction 同源。 */
const PROTOCOL_ACTION_KINDS = ["tool_call", "parallel_tool_call", "finalize"];

// ─── 工具 ────────────────────────────────────────────────────────────────────

function walk(dir: string, pattern: RegExp, acc: string[] = []): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(full, pattern, acc);
    } else if (pattern.test(e.name)) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * 取一段以 `{` 开头的文本里**深度 1** 的键名。
 * 用花括号计数而非纯正则，避免把嵌套对象的键当成顶层键。
 */
function topLevelKeys(objText: string): string[] {
  const keys: string[] = [];
  const KEY_RE = /(?:^|[,{\s])\s*"?([A-Za-z_][A-Za-z0-9_]*)"?\s*:/;
  let depth = 0;
  let buf = "";
  const flush = (): void => {
    const m = KEY_RE.exec(buf);
    if (m) keys.push(m[1]);
    buf = "";
  };
  for (let i = 0; i < objText.length; i++) {
    const c = objText[i];
    if (c === "{" || c === "[") {
      if (depth === 1) flush();
      depth++;
      continue;
    }
    if (c === "}" || c === "]") {
      if (depth === 1) flush();
      depth--;
      buf = "";
      continue;
    }
    if (depth === 1) {
      if (c === ",") flush();
      else buf += c;
    }
  }
  if (buf) flush();
  return [...new Set(keys)];
}

/** 从 `const Output = z.object({...})` 里取顶层字段名。 */
function extractOutputKeys(agentSource: string): string[] | null {
  const anchor = agentSource.indexOf("const Output = z.object({");
  if (anchor < 0) return null;
  const start = agentSource.indexOf("{", anchor + 23);
  let depth = 0;
  let end = -1;
  for (let i = start; i < agentSource.length; i++) {
    const c = agentSource[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const clean = agentSource
    .slice(start, end + 1)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  return topLevelKeys(clean);
}

/** 从 SKILL.md 里取"输出形状"那个 json 块（没有则 null）。 */
function extractDocOutputBlock(md: string): string | null {
  const lines = md.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!/^#{1,4}\s/.test(lines[i])) continue;
    if (!/output|输出/i.test(lines[i])) continue;
    const m = lines
      .slice(i + 1)
      .join("\n")
      .match(/```json\s*([\s\S]*?)```/);
    if (m) return m[1];
  }
  return null;
}

// ─── 自动建立 skill → agent 配对 ─────────────────────────────────────────────

const AGENT_FILES = walk(AI_APP_DIR, /\.agent\.ts$/);

const SKILL_ALLOWED = new Map<
  string,
  { keys: Set<string>; agents: string[] }
>();
for (const file of AGENT_FILES) {
  const src = fs.readFileSync(file, "utf8");
  const skillsMatch = src.match(/skills:\s*\[([\s\S]*?)\]/);
  if (!skillsMatch) continue;
  const skills = [...skillsMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (skills.length === 0) continue;
  const outputKeys = extractOutputKeys(src);
  if (!outputKeys || outputKeys.length === 0) continue;
  for (const skill of skills) {
    if (!fs.existsSync(path.join(SKILLS_DIR, skill, "SKILL.md"))) continue;
    const cur = SKILL_ALLOWED.get(skill) ?? {
      keys: new Set<string>(),
      agents: [],
    };
    outputKeys.forEach((k) => cur.keys.add(k));
    cur.agents.push(path.relative(AI_APP_DIR, file).replace(/\\/g, "/"));
    SKILL_ALLOWED.set(skill, cur);
  }
}

const ALL_SKILL_DOCS = fs
  .readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => ({
    name: d.name,
    file: path.join(SKILLS_DIR, d.name, "SKILL.md"),
  }))
  .filter((s) => fs.existsSync(s.file))
  .map((s) => ({ ...s, text: fs.readFileSync(s.file, "utf8") }));

// ─── 断言 ────────────────────────────────────────────────────────────────────

describe("技能文档输出契约（全量自动配对）", () => {
  it("扫到了 agent 与技能（防止路径改名后本套件静默空跑）", () => {
    expect(AGENT_FILES.length).toBeGreaterThan(10);
    expect(ALL_SKILL_DOCS.length).toBeGreaterThan(5);
    expect(SKILL_ALLOWED.size).toBeGreaterThan(3);
  });

  describe("★ 技能文档不得教协议外的 action kind", () => {
    it.each(ALL_SKILL_DOCS.map((s) => [s.name, s] as const))(
      "%s",
      (_name, skill) => {
        const blocks = skill.text.match(/```json[\s\S]*?```/g) ?? [];
        for (const block of blocks) {
          for (const m of block.matchAll(/"kind"\s*:\s*"([^"]+)"/g)) {
            expect(PROTOCOL_ACTION_KINDS).toContain(m[1]);
          }
        }
      },
    );
  });

  // ★ 2026-08-03 判据反转（更根治）：harness 已经把真实 outputSchema 自动注入
  //   systemPrompt（agent-runner.service.ts 的 describeOutputSchemaForLlm）。
  //   技能文档再写一份输出形状，就是**同一件事的第二份描述** —— 两份一旦漂移，
  //   生产日志证明模型听文档那份，然后被 schema 驳回、耗尽重试、兑成垃圾产物。
  //   所以不是"两份要对齐"，而是**只能有一份**。
  describe("★ 被 agent 消费的技能，文档不得复述输出形状", () => {
    const consumed = ALL_SKILL_DOCS.filter((d) => SKILL_ALLOWED.has(d.name));

    it("确实扫到了被消费的技能（防止本套件空跑）", () => {
      expect(consumed.length).toBeGreaterThan(3);
    });

    it.each(consumed.map((s) => [s.name, s] as const))("%s", (_name, skill) => {
      const block = extractDocOutputBlock(skill.text);
      // block 非 null == 文档在 Output/输出 标题下又画了一份 json 形状
      expect({
        skill: skill.name,
        hasCompetingShapeBlock: block !== null,
      }).toEqual({ skill: skill.name, hasCompetingShapeBlock: false });
    });
  });

  // ★ 2026-08-03 审计发现但**刻意不看护**：多个技能 frontmatter 的 activateFor
  //   指向的 role id 全项目不存在。核实结论：skill-registry 的 listForRole()
  //   **零调用** —— 技能实际只靠 agent 的 `skills: [...]` 显式激活，activateFor
  //   是定义了却没人消费的死机制。为惰性元数据加看护只会制造无意义的改动；
  //   真要治，应该像 2026-05-22 删掉 7 个零消费 config 旋钮那样把它删掉或接上，
  //   属独立决策，不在本轮范围。

  describe("★ 事故回归：dim-chapter-integration 的旧输出字段名不得回来", () => {
    it("任何 json 块里都不得出现旧输出字段名", () => {
      const doc = ALL_SKILL_DOCS.find(
        (d) => d.name === "dim-chapter-integration",
      );
      expect(doc).toBeDefined();
      const blocks = (doc!.text.match(/```json[\s\S]*?```/g) ?? []).join("\n");
      // 只查 json 块：dimensionName 作为「输入字段」出现在 Inputs 散文段落是合法的，
      // 全文 substring 会误报（第一版就踩了）。
      for (const stale of [
        "integratedBody",
        "dimensionName",
        "sources",
        "mode",
      ]) {
        expect(blocks).not.toContain(`"${stale}"`);
      }
    });
  });
});
