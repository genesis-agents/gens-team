/**
 * 技能文档 ↔ agent outputSchema 契约看护
 *
 * ★ 2026-08-03（Railway 生产日志实证）：
 *   skills/dim-chapter-integration/SKILL.md 教模型输出
 *     {"mode":"integrate","dimensionName","integratedBody","totalWordCount","sources"}
 *   而 dimension-integrator.agent 的 outputSchema 是
 *     {dimension, abstract, keyFindings, totalWordCount, fullMarkdown}
 *   —— 除 totalWordCount 外**字段名全不一样**。
 *
 *   生产后果（日志原文）：
 *     finalize rejected (1/3): Schema: dimension: Required; chapters: Required
 *     finalize rejected (2/3): ...
 *     finalize rejected 3 times in a row, accepting current candidate to avoid infinite loop
 *   → 该维度拿到一份垃圾整合，白烧三轮 token。
 *
 *   文档里那句 `"mode": "integrate"` 还被模型具象成了不存在的 action kind：
 *     InvalidActionError: LLM returned unsupported action kind: "integrate"
 *     InvalidActionError: LLM returned unsupported action kind: "dim-chapter-integration"
 *
 *   这与本轮章节字数那条修复是同一个病：**文档承诺的与代码执行的不是一回事**，
 *   而模型对文档是照做的。所以要看护的不是某个字段，是"文档说什么代码就得认什么"。
 */

import * as fs from "fs";
import * as path from "path";

const SKILLS_DIR = path.join(__dirname, "..", "..", "..", "skills");

function listSkillDocs(): { name: string; file: string; text: string }[] {
  return fs
    .readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== "__tests__")
    .map((d) => ({
      name: d.name,
      file: path.join(SKILLS_DIR, d.name, "SKILL.md"),
    }))
    .filter((s) => fs.existsSync(s.file))
    .map((s) => ({ ...s, text: fs.readFileSync(s.file, "utf8") }));
}

const SKILL_DOCS = listSkillDocs();

/** ReAct 协议里真实存在的 action kind —— 与 react-loop.normalizeAction 同源。 */
const PROTOCOL_ACTION_KINDS = ["tool_call", "parallel_tool_call", "finalize"];

describe("技能文档输出契约", () => {
  it("至少扫到了技能文档（防止目录改名后本套件静默空跑）", () => {
    expect(SKILL_DOCS.length).toBeGreaterThan(5);
  });

  describe("★ 不得教模型使用协议外的 action kind", () => {
    it.each(SKILL_DOCS.map((s) => [s.name, s] as const))(
      "%s",
      (_name, skill) => {
        // 只看 ```json 代码块里的 "kind": "xxx" —— 那是模型会照抄的地方。
        const jsonBlocks = skill.text.match(/```json[\s\S]*?```/g) ?? [];
        for (const block of jsonBlocks) {
          const kinds = [...block.matchAll(/"kind"\s*:\s*"([^"]+)"/g)].map(
            (m) => m[1],
          );
          for (const k of kinds) {
            expect(PROTOCOL_ACTION_KINDS).toContain(k);
          }
        }
      },
    );
  });

  // ★ 通用规则（比"禁止某字段"正确）：文档示例里的顶层字段必须是 agent
  //   outputSchema 认识的，且 schema 的必填字段必须在文档里出现。
  //
  //   为什么不能一刀切禁 "mode"：verifier.agent 的 Output **真的**有
  //   `mode: z.literal("citation-audit")` —— citation-audit 文档写 mode 是对的。
  //   一刀切会把正确的判成错的。判据只能是"与真实 schema 比对"。
  describe("★ 文档示例字段 == 消费方 agent 的 outputSchema 字段", () => {
    const PAIRS: Array<{
      skill: string;
      required: string[];
      allowed: string[];
      /** 用于在多个 json 块中定位输出示例的锚字段 */
      anchor: string;
    }> = [
      {
        skill: "dim-chapter-integration",
        required: [
          "dimension",
          "abstract",
          "keyFindings",
          "totalWordCount",
          "fullMarkdown",
        ],
        allowed: [
          "dimension",
          "abstract",
          "keyFindings",
          "totalWordCount",
          "fullMarkdown",
        ],
        anchor: "fullMarkdown",
      },
      {
        skill: "chapter-quality-gate",
        required: ["index", "decision", "score", "summary"],
        allowed: [
          "index",
          "decision",
          "score",
          "issues",
          "summary",
          "critique",
          // issues[] 内层字段
          "severity",
          "dimension",
          "pointer",
          "issue",
          "suggestion",
        ],
        anchor: "decision",
      },
    ];

    it.each(PAIRS.map((p) => [p.skill, p] as const))("%s", (_name, pair) => {
      const doc = SKILL_DOCS.find((s) => s.name === pair.skill);
      expect(doc).toBeDefined();
      const block = (doc!.text.match(/```json[\s\S]*?```/g) ?? []).find((b) =>
        b.includes(pair.anchor),
      );
      expect(block).toBeDefined();
      const docKeys = [
        ...block!.matchAll(/"([A-Za-z][A-Za-z0-9_]*)"\s*:/g),
      ].map((m) => m[1]);
      // 文档不得教 schema 不认识的字段
      for (const k of docKeys) {
        expect(pair.allowed).toContain(k);
      }
      // schema 必填字段必须在文档里出现，否则模型不知道要给 → 必被驳回
      for (const k of pair.required) {
        expect(docKeys).toContain(k);
      }
    });
  });

  describe("★ dim-chapter-integration：文档字段必须等于 agent outputSchema 字段", () => {
    const doc = SKILL_DOCS.find((s) => s.name === "dim-chapter-integration");

    it("技能文档存在", () => {
      expect(doc).toBeDefined();
    });

    it("文档示例的字段 == dimension-integrator.agent 的 Output 字段", () => {
      // agent Output（dimension-integrator.agent.ts）的真实字段
      const schemaKeys = [
        "dimension",
        "abstract",
        "keyFindings",
        "totalWordCount",
        "fullMarkdown",
      ];
      const block = (doc!.text.match(/```json[\s\S]*?```/g) ?? []).find((b) =>
        b.includes("fullMarkdown"),
      );
      expect(block).toBeDefined();
      const docKeys = [
        ...block!.matchAll(/"([A-Za-z][A-Za-z0-9_]*)"\s*:/g),
      ].map((m) => m[1]);
      // 文档里出现的每个顶层键都必须是 schema 认识的
      for (const k of docKeys) {
        expect(schemaKeys).toContain(k);
      }
      // schema 的每个必填字段都必须在文档里出现（否则模型不知道要给）
      for (const k of schemaKeys) {
        expect(docKeys).toContain(k);
      }
    });

    it("★ 事故回归：旧的输出字段名不得回到输出示例里", () => {
      // 注意只查**输出示例块**：dimensionName 作为"输入字段"出现在
      // "Inputs you receive" 段落是合法的，全文 substring 会误报（第一版就踩了）。
      const block = (doc!.text.match(/```json[\s\S]*?```/g) ?? []).find((b) =>
        b.includes("fullMarkdown"),
      );
      expect(block).toBeDefined();
      for (const stale of [
        "integratedBody",
        "dimensionName",
        "sources",
        "mode",
      ]) {
        expect(block!).not.toContain(`"${stale}"`);
      }
    });
  });
});
