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

/** 逗号分隔的模块前缀白名单；空/未设置 = 全部走代码兜底（零下降默认） */
export const POLICY_DB_MODULES_ENV = "POLICY_DB_MODULES";
