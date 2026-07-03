/**
 * Golden eval 回归套件 — L3-W0 #5（2026-07-02）
 *
 * 目的：裁判链自身的回归尺子。W1+ 任何对 parseVerdict / callJudgeLLM /
 * consensus 的改动，先过这里的全部 golden 样本——裁判不可信则一切
 * "零下降"签字失效。
 *
 * 样本维护约定（见 golden-cases.json 顶部说明）：
 *   - 新发现的裁判误判，先在 golden-cases.json 落一条失败样本再修（复现先行）
 *   - 样本只增不删；删除即回归面收缩，需在 PR 说明
 */
import { readFileSync } from "fs";
import { join } from "path";
import { JudgeService } from "../../judge.service";
import { createConsensusResolver } from "../../primitives/consensus";
import type { Verdict } from "@/modules/ai-harness/runner/env/types";

const goldenCases: unknown = JSON.parse(
  readFileSync(join(__dirname, "golden-cases.json"), "utf8"),
);

interface ParsingCase {
  id: string;
  why?: string;
  raw: string;
  expect: { score: number } | null;
}

interface ConsensusCase {
  id: string;
  why?: string;
  verdicts: Array<{ judgeId: string; score: number }>;
  expect: string;
}

// parseVerdict 是 JudgeService 私有方法；golden 套件直接测它（解析是纯函数，
// 不值得为可测性把它公开）。chat 依赖在解析路径上不会被触碰。
function parseVerdict(raw: string): { score: number; critique: string } | null {
  const svc = new JudgeService(null as never);
  return (
    svc as unknown as {
      parseVerdict(r: string): { score: number; critique: string } | null;
    }
  ).parseVerdict(raw);
}

describe("golden eval — verdict parsing", () => {
  const cases = (goldenCases as { verdictParsing: ParsingCase[] })
    .verdictParsing;

  it("has at least the seed samples", () => {
    expect(cases.length).toBeGreaterThanOrEqual(6);
  });

  it.each(cases.map((c) => [c.id, c] as const))(
    "parses golden case %s",
    (_id, c) => {
      const parsed = parseVerdict(c.raw);
      if (c.expect === null) {
        expect(parsed).toBeNull();
      } else {
        expect(parsed).not.toBeNull();
        expect(parsed?.score).toBe(c.expect.score);
      }
    },
  );
});

describe("golden eval — consensus", () => {
  const cases = (goldenCases as { consensus: ConsensusCase[] }).consensus;
  const resolver = createConsensusResolver();

  it.each(cases.map((c) => [c.id, c] as const))(
    "resolves golden case %s",
    (_id, c) => {
      const verdicts: Verdict[] = c.verdicts.map((v) => ({
        judgeId: v.judgeId,
        score: v.score,
        critique: `golden:${c.id}`,
      }));
      expect(resolver(verdicts).verdict).toBe(c.expect);
    },
  );
});
