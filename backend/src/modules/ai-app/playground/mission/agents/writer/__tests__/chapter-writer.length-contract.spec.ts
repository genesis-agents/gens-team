/**
 * 章节字数契约 —— 提示词承诺的交付线 == reviewer 评分的交付线 == 闸门打回的交付线。
 *
 * ★ 2026-08-03 事故与机制（用户实证）：
 *   两个 mission、不同主题，多章精确落在 612 字 = round(874 × 0.7)。612 不是模型
 *   估算出来的，是当年提示词 `${Math.round(targetWords * 0.7)}` **渲染出的字面量**，
 *   模型照抄。同一份代码 6 月用 DeepSeek 一切正常（它天然铺陈、从不理会那行下限），
 *   8 月换成照做型模型后立刻精确贴线 —— 输出长度从来就没有被代码保证过，只是被
 *   模型的惯性掩盖了两个多月。
 *
 *   当时同一个概念在四处各写各的数字：
 *     · writer 提示词 0.7×（还明写"不是硬约束""低于 800 字也不会被打回"）
 *     · reviewer 评分 ≥ 0.5× 即给字数满分
 *     · pipeline 闸门 < 0.4× 才打回
 *     · 打回话术又说"0.6× 以上即可"
 *   模型永远挑其中最省力的那个照做，挑的还正好是我们印得最显眼的那个。
 *
 * 本套件锁住机制本身（不是锁某个具体数值）：
 *   1. 交付线由 pipeline 一次算出、向下传，writer / reviewer 只印下传值
 *   2. 提示词里不得再出现任何低于交付线的字数锚（历史上的 0.7/0.6/0.5/0.4×）
 *   3. 比例来自 playground 策略旋钮（DEFAULTS → 模型档位 profile → env → DB
 *      overlay），换模型/换档位不改代码 —— 见 playground-runtime.config.ts
 */

import { ChapterWriterAgent } from "../chapter-writer.agent";
import { ChapterReviewerAgent } from "../chapter-reviewer.agent";
import { loadPlaygroundRuntimeConfig } from "../../../../runtime/playground-runtime.config";
import { getPlaygroundStrategyThresholds } from "../../../../runtime/playground-strategy-policy";

const TARGET = 874; // 生产实测值（dimTargetWords / 章节数）

function writerPrompt(minDeliveryWords: number): string {
  const agent = new ChapterWriterAgent();
  return agent.buildSystemPrompt({
    input: {
      topic: "AI Trends",
      dimension: "Market",
      language: "zh-CN",
      chapter: {
        index: 1,
        heading: "Overview",
        thesis: "T",
        keyPoints: ["a"],
      },
      sources: [],
      targetWords: TARGET,
      minDeliveryWords,
      lengthProfile: "brief", // 低端 600 —— 故意选会低于交付线的档位
    },
    identity: { agentId: "w#1", role: "chapter-writer" },
  } as never);
}

function reviewerPrompt(minDeliveryWords: number): string {
  const agent = new ChapterReviewerAgent();
  return agent.buildSystemPrompt({
    input: {
      topic: "AI Trends",
      dimension: "Market",
      language: "zh-CN",
      chapter: {
        index: 1,
        heading: "Overview",
        thesis: "T",
        body: "body",
        wordCount: 612,
        targetWords: TARGET,
        minDeliveryWords,
      },
      availableSourceCount: 2,
    },
    identity: { agentId: "r#1", role: "chapter-reviewer" },
  } as never);
}

describe("章节字数契约", () => {
  const ratio = getPlaygroundStrategyThresholds().chapterMinDeliveryRatio;
  const minDeliveryWords = Math.round(TARGET * ratio);

  describe("交付线来自策略旋钮，不是写死的数字", () => {
    it("旋钮存在于 runtime config（可经 profile / env / DB overlay 覆盖）", () => {
      const cfg = loadPlaygroundRuntimeConfig({} as NodeJS.ProcessEnv);
      expect(typeof cfg.chapterMinDeliveryRatio).toBe("number");
      expect(cfg.chapterMinDeliveryRatio).toBeGreaterThan(0);
      expect(cfg.chapterMinDeliveryRatio).toBeLessThanOrEqual(1);
    });

    it("env 可覆盖 —— 换模型不必改代码、不必发版", () => {
      const cfg = loadPlaygroundRuntimeConfig({
        CHAPTER_MIN_DELIVERY_RATIO: "0.55",
      } as unknown as NodeJS.ProcessEnv);
      expect(cfg.chapterMinDeliveryRatio).toBeCloseTo(0.55);
    });

    it("★ 交付线必须严于历史上那条形同虚设的 0.4×", () => {
      expect(ratio).toBeGreaterThan(0.4);
    });
  });

  describe("writer / reviewer 印的是同一个下传值", () => {
    it("writer 提示词印出交付线本身", () => {
      expect(writerPrompt(minDeliveryWords)).toContain(
        String(minDeliveryWords),
      );
    });

    it("reviewer 的字数满分线 == 同一个交付线（不再是自带的 50%）", () => {
      const p = reviewerPrompt(minDeliveryWords);
      expect(p).toContain(String(minDeliveryWords));
      expect(p).not.toContain("50%");
    });

    it("交付线变了，两边同时跟着变（证明是下传值而非各自算）", () => {
      const other = 321;
      expect(writerPrompt(other)).toContain("321");
      expect(reviewerPrompt(other)).toContain("321");
    });
  });

  describe("★ 事故回归：提示词不得再出现任何低于交付线的字数锚", () => {
    const prompt = () => writerPrompt(minDeliveryWords);

    it.each([
      ["0.7×（事故里模型精确照抄的那个 612）", 0.7],
      ["0.6×（旧打回话术说的“以上即可”）", 0.6],
      ["0.5×（旧 reviewer 字数满分线）", 0.5],
      ["0.4×（旧闸门线）", 0.4],
    ])("不出现 %s", (_label, r) => {
      const anchor = Math.round(TARGET * r);
      // 前提校验：该锚确实低于交付线，否则这条断言没有意义
      expect(anchor).toBeLessThan(minDeliveryWords);
      // 限定在「独立数字 + 字」的字数语境：提示词里还有 "350%"、以及反模式示例
      // "（字数：约1350字）"——裸 substring / 无边界正则都会误报（两版都踩过）。
      expect(prompt()).not.toMatch(new RegExp(`(?<!\\d)${anchor}\\s*字`));
    });

    it("档位范围的低端被交付线夹住（brief 低端 600 不得漏出）", () => {
      // brief = [600, 1000]；600 < 交付线时必须被 clamp 掉
      expect(600).toBeLessThan(minDeliveryWords);
      expect(prompt()).not.toContain("600-");
    });

    it("那两句“少写没关系”的逃生口不得回归", () => {
      const p = prompt();
      expect(p).not.toContain("不是硬约束");
      expect(p).not.toContain("不会因为字数不足被打回");
    });
  });
});
