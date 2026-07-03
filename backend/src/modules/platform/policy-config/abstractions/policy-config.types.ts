/**
 * PolicyConfig 类型契约（L3 W1 策略数据化）
 *
 * 设计稿: docs/architecture/policy-config-design.md
 */

import { PolicyKind, Prisma } from "@prisma/client";

export { PolicyKind };

export type PolicySource = "db" | "code";

/** dual-read 解析结果：source 指明本次取值来自 DB 还是代码兜底 */
export interface PolicyResolution<T> {
  value: T;
  source: PolicySource;
  /** 仅 source="db" 时存在 */
  version?: number;
  /** 仅 source="db" 时存在 */
  contentHash?: string;
}

export interface ProposePolicyInput {
  /** 命名空间点分 key: "<module>.<kind>.<name>"，全小写 kebab-case */
  key: string;
  kind: PolicyKind;
  value: Prisma.InputJsonValue;
  /** who: "human:<email>" | "system:<component>" */
  createdBy: string;
  /** why: 必填，审计链是 L3 回滚的依据 */
  changeReason: string;
}

/** key 格式: 至少 3 段点分，每段小写 kebab-case（首段=模块名，供逐模块 flag 匹配） */
export const POLICY_KEY_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+){2,}$/;

/**
 * 结构化策略 value 的通用防坏行守卫：DB 值必须"形状兼容"代码兜底值——
 * reference 的每个叶子键都存在且类型一致（数字须有限；数组对数组；对象递归；
 * DB 值允许多余键 = 向前兼容）。消费方 source="db" 时不通过则回代码兜底，
 * 防止缺字段/类型漂移的 DB 行直接 TypeError/NaN 注入业务路径。
 */
export function conformsToShape(value: unknown, reference: unknown): boolean {
  if (typeof reference === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (Array.isArray(reference)) {
    if (!Array.isArray(value)) return false;
    // 数组元素按 reference 首元素形状抽查（空 reference 数组不约束元素）
    return (
      reference.length === 0 ||
      value.every((v) => conformsToShape(v, reference[0]))
    );
  }
  if (reference !== null && typeof reference === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return Object.entries(reference as Record<string, unknown>).every(
      ([k, ref]) => conformsToShape((value as Record<string, unknown>)[k], ref),
    );
  }
  return typeof value === typeof reference;
}

/** 逗号分隔的模块前缀白名单；空/未设置 = 全部走代码兜底（零下降默认） */
export const POLICY_DB_MODULES_ENV = "POLICY_DB_MODULES";
