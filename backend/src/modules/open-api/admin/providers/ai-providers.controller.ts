/**
 * AI Provider catalog admin controller
 *
 * 管理 ai_providers 表的 system 级 provider（admin 维护，全局共享）。
 * 用户级 (scope=user) provider 由 byok 模块 user-api-keys.controller 管。
 *
 * 数据驱动 BYOK：admin 这里 +/-/edit provider，前端 catalog tile 自动更新，
 * 无需改代码 / 重启 / 重 deploy。
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  Min,
  IsUrl,
} from "class-validator";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import { AiProviderService } from "@/modules/ai-engine/facade";

class UpsertAIProviderDto {
  @IsString()
  @Matches(/^[a-z0-9-]+$/)
  @MaxLength(50)
  slug!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(500)
  endpoint!: string;

  @IsString()
  @Matches(/^(openai|anthropic|google|cohere)$/)
  apiFormat!: string;

  @IsString()
  @MaxLength(100)
  testModel!: string;

  @IsArray()
  @IsString({ each: true })
  capabilities!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  iconUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  // ★ 2026-08-04 深度检视 #10：这两个字段随 /user/api-keys 下发给**每一个普通用户**，
  //   并被三处 UI 直接 `href={...}` 渲染成可点链接。React 不过滤 href 协议，
  //   admin 误粘贴/账号被接管写入 `javascript:...` 就会在任意用户会话里执行。
  //   原先只有 @IsString + @MaxLength 放行。前端渲染前另有一道白名单（双保险，
  //   挡存量脏数据）。
  @IsString()
  @MaxLength(500)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  docUrl?: string;

  /** 申领 API Key 的控制台页（区别于 docUrl 的文档首页），admin 可维护 */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @IsUrl({ protocols: ["http", "https"], require_protocol: true })
  apiKeyUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  freeTierNote?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller("admin/ai-providers")
export class AiProvidersController {
  constructor(private readonly aiProviderService: AiProviderService) {}

  @Get()
  list() {
    return this.aiProviderService.list();
  }

  @Post()
  create(@Body() dto: UpsertAIProviderDto) {
    return this.aiProviderService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: Partial<UpsertAIProviderDto>) {
    return this.aiProviderService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.aiProviderService.remove(id);
  }
}
