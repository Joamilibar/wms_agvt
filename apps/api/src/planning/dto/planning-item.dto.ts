import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
  IsBoolean,
  MinLength,
  IsArray,
  ValidateNested,
  IsDateString,
  IsMongoId,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ORIGINS, LIFECYCLES } from '../schemas/planning-item.schema.js';
import type { Origin, Lifecycle } from '../schemas/planning-item.schema.js';

export class UpsertPlanningItemDto {
  @ApiProperty({ example: '62697040648535' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'SABANAS' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: ORIGINS })
  @IsOptional()
  @IsIn(ORIGINS)
  origin?: Origin;

  @ApiPropertyOptional({ description: 'ObjectId del proveedor' })
  @IsOptional()
  @IsMongoId()
  supplierId?: string | null;

  /** Convenience for bulk imports: resolved (and created if missing) by name. */
  @ApiPropertyOptional({ example: 'BAMBOOLYO' })
  @IsOptional()
  @IsString()
  supplierName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  transitDays?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  moq?: number | null;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  orderMultiple?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  familyKey?: string | null;

  @ApiPropertyOptional({ enum: LIFECYCLES })
  @IsOptional()
  @IsIn(LIFECYCLES)
  lifecycle?: Lifecycle;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  launchDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  successorSku?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  analogSku?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isHotelLine?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  fobCost?: number | null;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  costCurrency?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePlanningItemDto extends PartialType(UpsertPlanningItemDto) {}

export class BulkPlanningItemsDto {
  @ApiProperty({ type: [UpsertPlanningItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertPlanningItemDto)
  items!: UpsertPlanningItemDto[];
}

export class QueryPlanningItemsDto {
  @ApiPropertyOptional({ enum: ORIGINS })
  @IsOptional()
  @IsIn(ORIGINS)
  origin?: Origin;

  @ApiPropertyOptional({ enum: LIFECYCLES })
  @IsOptional()
  @IsIn(LIFECYCLES)
  lifecycle?: Lifecycle;

  @ApiPropertyOptional({ description: 'Solo importados sin proveedor o sin lead time' })
  @IsOptional()
  @IsIn(['true', 'false'])
  missingSupply?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
