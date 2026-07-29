import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class UpdateRadarSourceDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** 信源权威性 1-5 星，参与 Stage A 打分。见 CreateRadarSourceDto 同名字段。 */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  authorityWeight?: number;
}
