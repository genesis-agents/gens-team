/**
 * LLM 输出 null 容忍 —— `.optional()` 收不下 `null` 的通用解法。
 *
 * 背景（用户实证 prod 2026-08-02）：
 *   finalize rejected: conflicts.0.preferredFactId: Expected string, received null
 *
 * zod 的 `.optional()` 接受 `undefined` 但**不接受 `null`**。而 LLM 表达"这里没值"
 * 时，吐 `null` 和省略键的概率各占一半 —— 它没有"undefined"这个概念，JSON 里也没有。
 * 于是每个 `.optional()` 字段都是一颗雷：模型答对了内容，却因为用了 `null` 而被
 * 整份产物驳回，然后重试、烧钱、最终 RUNNER_OUTPUT_SCHEMA_MISMATCH。
 *
 * 为什么不逐个改成 `.nullish()`：全项目 agent schema 里有 271 处 `.optional()`，
 * 逐个改是打地雷，且新写的 schema 会继续踩。这不是能靠自觉维持的约定。
 *
 * 为什么不无脑剥掉所有 null：还有 21 处 `.nullable()` —— 那些字段的 `null` 是**有
 * 语义的真值**（"已判定为空" ≠ "没这个字段"）。一刀切会把它们从"值是 null"变成
 * "字段缺失"，直接触发 Required，把一个 bug 换成另一个。
 *
 * 做法：**让 schema 自己说了算**。先 parse 一次，只挑出 zod 明确报为
 * "expected X, received null" 的那些路径剥掉，再 parse 一次。
 *   - `.nullable()` 字段的 null 根本不会产生 issue → 永远不会被碰
 *   - 必填字段的 null 剥掉后变 Required，仍然报错 → 该拒的照拒
 *   - 只多跑一次 safeParse，且仅在首次失败时
 */

import type { ZodTypeAny, SafeParseReturnType } from "zod";

/** 从 zod issue 里挑出"该位置是 null 但 schema 不收 null"的路径。 */
function collectSchemaRejectedNullPaths(
  issues: readonly {
    code: string;
    path: readonly (string | number)[];
    message: string;
  }[],
): (string | number)[][] {
  const paths: (string | number)[][] = [];
  for (const iss of issues) {
    if (iss.code !== "invalid_type") continue;
    // zod v3 的 invalid_type 文案形如 "Expected string, received null"。
    // 不读 iss.received（跨 zod 版本字段名漂移过），改为下方按实际值二次确认，
    // 这里只做低成本预筛。
    if (!/received null/i.test(iss.message)) continue;
    if (iss.path.length === 0) continue; // 根节点是 null → 无处可剥，交给 schema 拒
    paths.push([...iss.path]);
  }
  return paths;
}

/**
 * 删除 path 指向的属性。仅当父节点是**普通对象**时才动手：
 * 数组元素为 null 时删除会留空洞或移位（还会让后续 path 的下标全错），
 * 语义上也不等价于"字段缺失"，故保持原样交给 schema 判定。
 *
 * @returns 是否真的删除了
 */
function deleteAtPath(root: unknown, path: (string | number)[]): boolean {
  let node: unknown = root;
  for (let i = 0; i < path.length - 1; i++) {
    if (node == null || typeof node !== "object") return false;
    node = (node as Record<string | number, unknown>)[path[i]];
  }
  if (node == null || typeof node !== "object" || Array.isArray(node)) {
    return false;
  }
  const leaf = path[path.length - 1];
  const obj = node as Record<string | number, unknown>;
  // 二次确认：只剥真的是 null 的值（防 issue 文案误判误删有效数据）
  if (obj[leaf] !== null) return false;
  delete obj[leaf];
  return true;
}

function deepClone<T>(value: T): T {
  // structuredClone 在 Node 18+ 可用；LLM 输出是纯 JSON 值，退化路径也安全。
  const g = globalThis as { structuredClone?: <U>(v: U) => U };
  if (typeof g.structuredClone === "function") return g.structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * 带 null 容忍的 safeParse。行为与 `schema.safeParse` 完全一致，只多一件事：
 * 首次失败且失败原因里含"schema 不收的 null"时，剥掉那些 null 再试一次。
 *
 * 两次都失败则返回**第一次**的结果 —— 报错信息要贴合模型真实输出，
 * 否则 critique 会拿着一份被我们改过的数据去指正模型，指错方向。
 */
export function safeParseTolerantOfNull<T extends ZodTypeAny>(
  schema: T,
  candidate: unknown,
): SafeParseReturnType<unknown, T["_output"]> {
  const first = schema.safeParse(candidate);
  if (first.success) return first;

  if (candidate == null || typeof candidate !== "object") return first;

  const paths = collectSchemaRejectedNullPaths(first.error.issues);
  if (paths.length === 0) return first;

  let stripped: unknown;
  try {
    stripped = deepClone(candidate);
  } catch {
    return first; // 不可克隆（含循环引用等）→ 不冒险改原对象
  }

  let removed = 0;
  for (const p of paths) {
    if (deleteAtPath(stripped, p)) removed += 1;
  }
  if (removed === 0) return first;

  const second = schema.safeParse(stripped);
  return second.success ? second : first;
}
