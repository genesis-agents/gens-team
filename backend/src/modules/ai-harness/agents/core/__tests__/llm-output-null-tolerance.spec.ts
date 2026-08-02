/**
 * safeParseTolerantOfNull 单元测试
 *
 * 回归来源（用户实证 prod 2026-08-02）：
 *   finalize rejected: conflicts.0.preferredFactId: Expected string, received null
 * `.optional()` 收 undefined 不收 null，而 LLM 表达"没值"时吐 null 和省略键各半。
 *
 * 本套件的重点不是"能剥 null"，而是**剥得够窄**：
 *   - `.nullable()` 的 null 是有语义的真值，一个都不许动
 *   - 必填字段的 null 剥掉后必须仍然报错，不能把该拒的放行
 */

import { z } from "zod";
import { safeParseTolerantOfNull } from "../llm-output-null-tolerance";

describe("safeParseTolerantOfNull", () => {
  describe("核心场景：optional 字段收到 null", () => {
    const Conflict = z.object({
      factIds: z.array(z.string()).min(2),
      preferredFactId: z.string().optional(),
      rationale: z.string(),
    });

    it("生产原样：conflicts[0].preferredFactId=null → 通过", () => {
      const schema = z.object({ conflicts: z.array(Conflict) });
      const r = safeParseTolerantOfNull(schema, {
        conflicts: [
          {
            factIds: ["fact-1", "fact-3"],
            preferredFactId: null,
            rationale: "两源冲突",
          },
        ],
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.conflicts[0].preferredFactId).toBeUndefined();
        // 同层其它字段不得受影响
        expect(r.data.conflicts[0].rationale).toBe("两源冲突");
      }
    });

    it("深层嵌套的 optional null 也能剥", () => {
      const schema = z.object({
        a: z.object({ b: z.object({ c: z.string().optional() }) }),
      });
      const r = safeParseTolerantOfNull(schema, { a: { b: { c: null } } });
      expect(r.success).toBe(true);
    });

    it("同时多个 optional 为 null → 一次全剥", () => {
      const schema = z.object({
        x: z.string().optional(),
        y: z.number().optional(),
        z: z.string(),
      });
      const r = safeParseTolerantOfNull(schema, { x: null, y: null, z: "ok" });
      expect(r.success).toBe(true);
    });

    it("不改动调用方传入的原对象（无副作用）", () => {
      const schema = z.object({ x: z.string().optional() });
      const input = { x: null };
      safeParseTolerantOfNull(schema, input);
      expect(input.x).toBeNull();
    });
  });

  describe("边界：不得误伤", () => {
    it("★ .nullable() 的 null 是真值，必须原样保留", () => {
      const schema = z.object({ verdict: z.string().nullable() });
      const r = safeParseTolerantOfNull(schema, { verdict: null });
      expect(r.success).toBe(true);
      if (r.success) {
        // 关键：是 null 而不是被剥成 undefined —— "已判定为空" ≠ "没这个字段"
        expect(r.data.verdict).toBeNull();
        expect("verdict" in r.data).toBe(true);
      }
    });

    it("★ 必填字段收到 null → 仍然失败（该拒的照拒）", () => {
      const schema = z.object({ required: z.string() });
      const r = safeParseTolerantOfNull(schema, { required: null });
      expect(r.success).toBe(false);
    });

    it("混合：optional 剥掉、nullable 保留、必填仍拒", () => {
      const schema = z.object({
        opt: z.string().optional(),
        nul: z.string().nullable(),
        req: z.string(),
      });
      expect(
        safeParseTolerantOfNull(schema, { opt: null, nul: null, req: null })
          .success,
      ).toBe(false);

      const ok = safeParseTolerantOfNull(schema, {
        opt: null,
        nul: null,
        req: "here",
      });
      expect(ok.success).toBe(true);
      if (ok.success) {
        expect(ok.data.opt).toBeUndefined();
        expect(ok.data.nul).toBeNull();
      }
    });

    it("非 null 原因导致的失败 → 原样返回首次错误（报错要贴合模型真实输出）", () => {
      const schema = z.object({ n: z.number() });
      const r = safeParseTolerantOfNull(schema, { n: "not-a-number" });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues[0].path).toEqual(["n"]);
      }
    });

    it("数组元素本身是 null → 不剥（删元素会移位，语义也不等价于字段缺失）", () => {
      const schema = z.object({ items: z.array(z.string()) });
      const r = safeParseTolerantOfNull(schema, { items: ["a", null, "c"] });
      expect(r.success).toBe(false);
    });

    it("根节点是 null / 非对象 → 直接交给 schema 判定", () => {
      const schema = z.object({ x: z.string().optional() });
      expect(safeParseTolerantOfNull(schema, null).success).toBe(false);
      expect(safeParseTolerantOfNull(schema, "str").success).toBe(false);
    });
  });

  describe("首次即通过时零介入", () => {
    it("合法输入原样返回", () => {
      const schema = z.object({ x: z.string() });
      const r = safeParseTolerantOfNull(schema, { x: "v" });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.x).toBe("v");
    });

    it("optional 字段本就省略 → 通过", () => {
      const schema = z.object({ x: z.string().optional(), y: z.string() });
      expect(safeParseTolerantOfNull(schema, { y: "v" }).success).toBe(true);
    });
  });
});
