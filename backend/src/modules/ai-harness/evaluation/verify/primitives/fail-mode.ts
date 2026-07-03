/**
 * Eval fail-mode 开关 — L3-W0 造尺子（2026-07-02）
 *
 * 背景：裁判链存在三处 fail-open——judge LLM 挂掉/输出不可解析时伪造
 * 50 分入共识（self-judge callJudgeLLM）、共识收到空 verdicts 默认
 * pass 70（consensus / react-runner）。伪造分数在两个方向都是毒药：
 * 假 50 触发无谓 rework 烧 token，默认 pass 让坏产出直接过闸。
 *
 * 零下降策略：默认 fail-open（与历史行为逐字节一致），置
 * `EVAL_FAIL_CLOSED=1` 后切 fail-closed——judge 失败 = 弃权（abstain），
 * 全员弃权 = escalate_to_human，而非编造数字。生产先靠常开观测日志
 * 测量 fail-open 实际触发频率，再决定翻开关。
 */
export function isEvalFailClosed(): boolean {
  return process.env.EVAL_FAIL_CLOSED === "1";
}
