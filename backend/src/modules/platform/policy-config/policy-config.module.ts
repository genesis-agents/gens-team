/**
 * PolicyConfig Module — 版本化策略配置（L3 W1 策略数据化）
 *
 * L1 platform 通用基元：零 agent/mission 状态的版本化配置读写
 * （与 SettingsModule 同层同范式，@Global 供 ai-app / ai-harness 消费方注入）。
 */

import { Global, Module } from "@nestjs/common";
import { PolicyConfigService } from "./policy-config.service";

@Global()
@Module({
  providers: [PolicyConfigService],
  exports: [PolicyConfigService],
})
export class PolicyConfigModule {}
