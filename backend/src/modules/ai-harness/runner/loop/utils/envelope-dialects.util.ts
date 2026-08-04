/**
 * envelope-dialects.util.ts —— ReAct 决策信封的**方言归一**与对应 critique。
 *
 * 为什么单独成文件：react-loop.ts 已是 god-class（>2500 行），pre-push 有净增量
 * 闸。更重要的是这类逻辑本身内聚——它只关心「模型把信封写歪了怎么认回来」，
 * 与 loop 的调度、预算、事件流无关。
 *
 * ★ 背景（2026-08-04）：`7105552cb`(04-26) 把 normalizeAction 从「畸形静默合成空
 * finalize」改成「一律抛 InvalidActionError」。方向对——静默兜底把安全过滤器拒答/
 * 截断/缺字段全伪装成"模型主动交白卷"，触发 empty-finalize 熔断绕过重试链。但它
 * 留下一笔债：**每种模型方言都必须被显式容错**，否则整轮作废。而这些容错是一次
 * 生产事故补一条加上来的：
 *   f50b50d36 (05-07) toolId 写进 kind
 *   5e860b47b (08-03) actions 简写被泛化到 finalize
 *   6b813fcfd (08-03) parallel_tool_call 的 calls/actions 混用
 *   本次      (08-04) action 压平成 kind 字符串、载荷升顶层
 *
 * 病根是协议本身给同一件事提供了多种写法，模型混用完全可预期。协议文本已收敛成
 * 每个意图只留一种写法；parser 侧的容错**全部保留**（存量模型和别的服务商仍会吐
 * 旧方言，安全网不撤，只是不再主动教）。
 */

/**
 * normalizeAction 真正实现的三个协议 kind（协议文本也只教这三个）。
 *
 * 用于「action 退化成 kind 字符串」的判定：只认这三个，其它任意字符串不猜，
 * 照旧抛准确错误。与 react-loop 的 RESERVED_ACTION_KINDS 用途不同——那个是
 * toolId-as-kind 的反向排除表，含 subagent_spawn 等未实现的保留字。
 */
export const PROTOCOL_ACTION_KINDS: ReadonlySet<string> = new Set([
  "tool_call",
  "parallel_tool_call",
  "finalize",
]);

/**
 * 信封被**压平**时把载荷提回来：action 退化成 kind 字符串，本该在 action 里的
 * 字段升到顶层当 thinking 的兄弟。
 *
 * ★ 生产实证（researcher 81653316 iter=2）：
 *     {"action":"parallel_tool_call","calls":[{"toolId":"web-search",…}, …×5]}
 *   → InvalidActionError: missing valid 'action' field (got string)
 *   JSON 完整、5 个工具调用参数齐全，却被整份丢弃，一个工具都没跑。
 *
 * @returns 可交给 normalizeAction 的对象；不是这种方言时返回 null（交回原路径
 *          抛准确错误，容错不吞真问题）。
 */
export function liftFlattenedEnvelope(
  obj: Record<string, unknown>,
): Record<string, unknown> | null {
  if (typeof obj.action !== "string") return null;
  const kind = obj.action.trim();
  if (!PROTOCOL_ACTION_KINDS.has(kind)) return null;
  const lifted: Record<string, unknown> = { ...obj, kind };
  delete lifted.action;
  delete lifted.thinking;
  return lifted;
}

/**
 * 信封畸形（JSON 解出来了但 action 形状不合法）时该说的**真话**。
 *
 * ★ 为什么要专门一条：这种情况走的是与 JsonExtractFailed 相同的兜底——raw 被塞
 * 进 finalize.output——却掉进"产物校验失败"的通用 critique，于是：
 *   模型吐 {"action":"parallel_tool_call","calls":[5 个工具调用]}
 *     → 信封畸形，一个工具都没执行
 *     → critique 却说「你的 finalize.output 校验失败：dimension/findings/summary
 *        Required」
 * 一个**想搜索**的 agent 被告知"该交 findings 了"，下一轮很可能不搜就编 ——
 * 与 a5a1f0963「critique 说假话把模型带偏两轮」同款危害。
 *
 * 真话是：你的意图没能执行，因为信封形状不对；工具**没有跑**。给出的行动也必须
 * 不同——不是"补字段"，而是"用正确信封重发同一个意图"。
 */
export function buildMalformedEnvelopeCritique(
  rejectCount: number,
  maxRejects: number,
  parseErrorMessage: string,
): string {
  return (
    `[ENVELOPE REJECTED ${rejectCount}/${maxRejects}] ` +
    `Your JSON parsed fine, but its "action" envelope was not in an executable shape ` +
    `(${parseErrorMessage.slice(0, 200)}). ` +
    `NOTHING you asked for was run — no tool was called — and your raw text was used as the ` +
    `output instead, which is why any schema complaints look unrelated to what you wrote.\n` +
    `Re-send the SAME intent using exactly one of these envelopes:\n` +
    `  one tool:    {"thinking":"...","action":{"kind":"tool_call","toolId":"<id>","input":{...}}}\n` +
    `  many tools:  {"thinking":"...","action":{"kind":"parallel_tool_call","calls":[{"toolId":"<id>","input":{...}}]}}\n` +
    `  final answer:{"thinking":"...","action":{"kind":"finalize","output":<answer>}}\n` +
    `"kind"/"toolId"/"input"/"calls" go INSIDE "action" — never as siblings of "thinking".\n` +
    `If you intended tool calls, emit them now — they were NOT executed.`
  );
}
