/**
 * PolicyConfigService — 版本化策略配置的 dual-read + 审计写入（L3 W1）
 *
 * 设计稿: docs/architecture/policy-config-design.md
 *
 * 核心不变式:
 * 1. append-only: 行创建后 value 不变，改 = propose 新 version；回滚 = 复制旧值为新 version 激活
 * 2. 每 key 至多一行 isActive=true（activate 事务保证）
 * 3. changeReason 必填 — 没有 why 的变更不允许落库
 *
 * 零下降三层保障:
 * - 逐模块 flag: POLICY_DB_MODULES 白名单外的 key 不查 DB，直接代码兜底
 * - fail-open: DB 异常 → warn + 代码兜底，策略读取永不阻断业务路径
 * - 快照等同: DB 空时 resolve 返回值与代码常量逐字节相等（消费方各配 spec）
 */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PolicyConfig, Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  POLICY_DB_MODULES_ENV,
  POLICY_KEY_PATTERN,
  PolicyResolution,
  ProposePolicyInput,
} from "./abstractions/policy-config.types";

interface ResolutionCacheEntry {
  row: Pick<PolicyConfig, "value" | "version" | "contentHash"> | null;
  timestamp: number;
}

@Injectable()
export class PolicyConfigService {
  private readonly logger = new Logger(PolicyConfigService.name);
  private readonly cache = new Map<string, ResolutionCacheEntry>();
  private readonly CACHE_TTL = 60_000;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * dual-read 唯一入口。DB 有 active 行且模块在白名单 → DB 值；否则代码兜底。
   * DB 空 / flag 关 / DB 异常时返回值与 codeFallback 逐字节相同（零下降承诺）。
   */
  async resolve<T>(key: string, codeFallback: T): Promise<PolicyResolution<T>> {
    if (!this.isModuleEnabled(key)) {
      return { value: codeFallback, source: "code" };
    }

    try {
      const row = await this.getActiveRow(key);
      if (!row) {
        return { value: codeFallback, source: "code" };
      }
      return {
        value: row.value as T,
        source: "db",
        version: row.version,
        contentHash: row.contentHash,
      };
    } catch (error) {
      this.logger.warn(
        `Policy resolve failed for "${key}", falling back to code value: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return { value: codeFallback, source: "code" };
    }
  }

  /** 提交新 version（不激活）。version 每 key 单调递增，从 1 起。 */
  async propose(input: ProposePolicyInput): Promise<PolicyConfig> {
    this.validateKey(input.key);
    if (!input.changeReason?.trim()) {
      throw new BadRequestException("changeReason is required (audit trail)");
    }
    if (!input.createdBy?.trim()) {
      throw new BadRequestException("createdBy is required (audit trail)");
    }

    // 尺寸上限：策略 value 会进 60s 内存缓存并随 mission 高频读取，超大 prose
    // （误操作/未来系统写手）会放大 token 成本甚至 provider 400——1MB 硬顶
    const serialized = JSON.stringify(input.value);
    if (serialized.length > 1_000_000) {
      throw new BadRequestException(
        `Policy value too large (${serialized.length} bytes > 1MB cap) for "${input.key}"`,
      );
    }

    const contentHash = this.hashValue(input.value);
    // @@unique([key, version]) 兜底并发冲突；人写场景冲突罕见，重试一次足够
    for (let attempt = 0; attempt < 2; attempt++) {
      const latest = await this.prisma.policyConfig.findFirst({
        where: { key: input.key },
        orderBy: { version: "desc" },
        select: { version: true },
      });
      try {
        return await this.prisma.policyConfig.create({
          data: {
            key: input.key,
            version: (latest?.version ?? 0) + 1,
            kind: input.kind,
            value: input.value,
            contentHash,
            createdBy: input.createdBy,
            changeReason: input.changeReason,
          },
        });
      } catch (error) {
        const isUniqueConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";
        if (!isUniqueConflict || attempt === 1) throw error;
      }
    }
    // 不可达：循环内 return 或 throw
    throw new Error("propose retry exhausted");
  }

  /**
   * 事务切换 active：取消旧 active + 激活目标 version，缓存失效。
   *
   * 并发安全：READ COMMITTED 下两个并发 activate 的 updateMany 语句快照互相
   * 看不见对方刚激活的行，应用层事务无法单独保证"每 key 至多一行 active"——
   * 由 DB partial unique index（policy_configs_one_active_per_key，20260703
   * 迁移）兜底：后提交事务撞 P2002 中止，这里重试一次即可看到已提交状态收敛。
   */
  async activate(
    key: string,
    version: number,
    activatedBy: string,
  ): Promise<PolicyConfig> {
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await this.prisma.$transaction(async (tx) => {
          const target = await tx.policyConfig.findUnique({
            where: { key_version: { key, version } },
          });
          if (!target) {
            throw new NotFoundException(
              `PolicyConfig ${key} v${version} not found`,
            );
          }
          await tx.policyConfig.updateMany({
            where: { key, isActive: true },
            data: { isActive: false },
          });
          return tx.policyConfig.update({
            where: { key_version: { key, version } },
            data: { isActive: true, activatedBy, activatedAt: new Date() },
          });
        });
        this.cache.delete(key);
        this.logger.log(
          `Policy "${key}" v${version} activated by ${activatedBy}`,
        );
        return result;
      } catch (error) {
        const isUniqueConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";
        if (!isUniqueConflict || attempt === 1) throw error;
      }
    }
  }

  /** 停用当前 active 行（所有消费方回代码兜底），缓存失效。 */
  async deactivate(key: string, by: string): Promise<void> {
    await this.prisma.policyConfig.updateMany({
      where: { key, isActive: true },
      data: { isActive: false },
    });
    this.cache.delete(key);
    this.logger.log(`Policy "${key}" deactivated by ${by} (code fallback now)`);
  }

  /**
   * 回滚 = 把旧 version 的值复制为新 version 并激活（审计线保持线性，
   * 谁在何时以何理由回滚可查），而非直接激活旧行。
   */
  async rollback(
    key: string,
    toVersion: number,
    by: string,
    reason: string,
  ): Promise<PolicyConfig> {
    const source = await this.prisma.policyConfig.findUnique({
      where: { key_version: { key, version: toVersion } },
    });
    if (!source) {
      throw new NotFoundException(
        `PolicyConfig ${key} v${toVersion} not found`,
      );
    }
    const proposed = await this.propose({
      key,
      kind: source.kind,
      value: source.value as Prisma.InputJsonValue,
      createdBy: by,
      changeReason: `rollback to v${toVersion}: ${reason}`,
    });
    return this.activate(key, proposed.version, by);
  }

  /** 全版本历史，新的在前。 */
  async history(key: string): Promise<PolicyConfig[]> {
    return this.prisma.policyConfig.findMany({
      where: { key },
      orderBy: { version: "desc" },
    });
  }

  // ==================== internals ====================

  /** key 首段 = 模块名；不在 POLICY_DB_MODULES 白名单内则不查 DB（零下降默认全关） */
  private isModuleEnabled(key: string): boolean {
    const raw = process.env[POLICY_DB_MODULES_ENV];
    if (!raw?.trim()) return false;
    const module = key.split(".")[0];
    return raw
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .includes(module);
  }

  private async getActiveRow(
    key: string,
  ): Promise<ResolutionCacheEntry["row"]> {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      return cached.row;
    }
    const row = await this.prisma.policyConfig.findFirst({
      where: { key, isActive: true },
      // orderBy 保证读取确定性（partial unique index 已保证至多一行，
      // 这里是历史坏数据下的确定性兜底：取最高 version）
      orderBy: { version: "desc" },
      select: { value: true, version: true, contentHash: true },
    });
    this.cache.set(key, { row, timestamp: Date.now() });
    return row;
  }

  private validateKey(key: string): void {
    if (!POLICY_KEY_PATTERN.test(key)) {
      throw new BadRequestException(
        `Invalid policy key "${key}" — expected "<module>.<kind>.<name>" (lowercase kebab-case, ≥3 segments)`,
      );
    }
  }

  /** sha256 前 16 hex，对齐 insight prompt-version.ts 的 hashPrompt 语义 */
  private hashValue(value: Prisma.InputJsonValue): string {
    return createHash("sha256")
      .update(JSON.stringify(value))
      .digest("hex")
      .slice(0, 16);
  }
}
