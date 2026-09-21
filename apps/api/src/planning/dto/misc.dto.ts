import { IsString, IsOptional, IsNumber, Min, Max, IsIn, IsBoolean, IsArray, IsDateString, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { WAREHOUSE_ROLES, PLANNING_USES } from '../schemas/warehouse.schema.js';
import type { WarehouseRole, PlanningUse } from '../schemas/warehouse.schema.js';
import { CHANNELS } from '../schemas/sales-history.schema.js';
import type { Channel } from '../schemas/sales-history.schema.js';

export class UpdateWarehouseDto {
  @ApiPropertyOptional({ enum: WAREHOUSE_ROLES })
  @IsOptional()
  @IsIn(WAREHOUSE_ROLES)
  role?: WarehouseRole;

  @ApiPropertyOptional({ enum: PLANNING_USES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(PLANNING_USES, { each: true })
  countsFor?: PlanningUse[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ChannelOverrideDto {
  @ApiPropertyOptional({ enum: CHANNELS, description: 'Omitir para volver a la regla' })
  @IsOptional()
  @IsIn(CHANNELS)
  channel?: Channel | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class LoadHistoryDto {
  @ApiPropertyOptional({ example: '2025-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class SetEtaDto {
  @ApiPropertyOptional({ example: '2026-10-15', description: 'null para borrar' })
  @IsOptional()
  @IsDateString()
  eta?: string | null;
}

/**
 * Every parameter is optional: the patch is merged over the current version.
 * Kept as explicit fields so the ValidationPipe whitelist rejects typos.
 */
export class UpdateParamsDto {
  @IsOptional() @IsNumber() @Min(1) projectMinUnits?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) projectOffices?: string[];
  @IsOptional() @IsNumber() companyRutMin?: number;
  @IsOptional() @IsNumber() companyRutMax?: number;
  @IsOptional() @IsNumber() @Min(50) outlierPercentile?: number;
  @IsOptional() @IsNumber() @Min(0) baseWeight12m?: number;
  @IsOptional() @IsNumber() growthDefault?: number;
  @IsOptional() @IsObject() growthByCategory?: Record<string, number>;
  @IsOptional() @IsObject() seasonalFactors?: Record<string, number>;
  @IsOptional() @IsNumber() @Min(0) yoyAlertPct?: number;
  @IsOptional() @IsBoolean() yoyMultiplierEnabled?: boolean;
  @IsOptional() @IsNumber() @Min(0) ssMonthsImported?: number;
  @IsOptional() @IsNumber() @Min(0) ssMonthsNational?: number;
  @IsOptional() @IsObject() zByClass?: Record<string, number>;
  @IsOptional() @IsNumber() @Min(1) reviewDays?: number;
  @IsOptional() @IsNumber() @Min(0) nationalLeadTimeDays?: number;
  @IsOptional() @IsNumber() @Min(1) moqMaxCoverageMonths?: number;
  @IsOptional() @IsNumber() @Min(0) overstockExtraMonths?: number;
  @IsOptional() @IsNumber() @Min(1) phaseOutMonths?: number;
  @IsOptional() @IsNumber() @Min(1) newSkuMonths?: number;
  @IsOptional() @IsNumber() @Min(1) storeCycleDays?: number;
  @IsOptional() @IsNumber() @Min(0) storeDeliveryDays?: number;
  @IsOptional() @IsObject() storeDisplayMin?: Record<string, number>;
  @IsOptional() @IsNumber() @Min(7) storeDemandWindowDays?: number;
  @IsOptional() @IsNumber() @Min(1) storeSplitDeliveryUnits?: number;
  @IsOptional() @IsNumber() @Min(0) scrapPct?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1) cuttingScrapPct?: number;
  @IsOptional() @IsNumber() @Min(0) defaultTuckCm?: number;
  @IsOptional() @IsNumber() @Min(0) defaultSelvageCm?: number;
  @IsOptional() @IsNumber() @Min(1) defaultCutBatchUnits?: number;
  @IsOptional() @IsObject() marginByChannel?: Record<string, number>;
  @IsOptional() @IsNumber() @Min(0) @Max(1) vatRate?: number;
  @IsOptional() @IsNumber() @Min(1) fabricCostStaleDays?: number;
  @IsOptional() @IsString() changeNote?: string;
}

export class RunDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
