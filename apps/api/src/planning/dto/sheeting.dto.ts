import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { SHEETING_FAMILIES, type SheetingFamily } from '../schemas/sheeting-model.schema.js';

// ── fabrics ──────────────────────────────────────────────────────────────────

export class UpsertFabricDto {
  @ApiProperty({ example: '63845371893523' })
  @IsString() @MinLength(1) sku!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;

  @ApiProperty({ example: 305, description: 'Ancho del rollo en cm. Nunca es constante: el lino convive en 290 y 135.' })
  @IsNumber() @Min(1) @Max(1000) rollWidthCm!: number;

  @ApiPropertyOptional({ example: 1 }) @IsOptional() @IsNumber() @Min(0) @Max(20) selvageCm?: number;

  @ApiPropertyOptional({ description: 'Caída o estampado direccional: no se corta contrahilo' })
  @IsOptional() @IsBoolean() directional?: boolean;

  @ApiPropertyOptional({ example: '500TC' }) @IsOptional() @IsString() @MaxLength(40) quality?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bsaleVariantId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

// ── models ───────────────────────────────────────────────────────────────────

export class TermDto {
  @IsString() @Matches(/^[A-Za-z][A-Za-z0-9_]*$/) var!: string;
  @IsNumber() coef!: number;
}

export class DimensionDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => TermDto) terms!: TermDto[];
  @IsNumber() const!: number;
}

export class PanelSpecDto {
  @IsString() @MinLength(1) @MaxLength(40) role!: string;
  @IsInt() @Min(1) @Max(50) count!: number;
  @ValidateNested() @Type(() => DimensionDto) width!: DimensionDto;
  @ValidateNested() @Type(() => DimensionDto) length!: DimensionDto;
  @IsBoolean() mitred45!: boolean;
}

export class ModelSupplyDto {
  @IsString() @MinLength(1) sku!: string;
  @IsOptional() @IsString() name?: string;
  @IsNumber() @Min(0) qty!: number;
  @IsIn(['un', 'kg', 'm']) uom!: 'un' | 'kg' | 'm';
}

export class SaveModelDto {
  @ApiProperty({ example: 'ENCIMERA_CRUCERO' })
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{2,39}$/, { message: 'code: mayúsculas, números y guión bajo' }) code!: string;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name!: string;

  @ApiProperty({ enum: SHEETING_FAMILIES })
  @IsIn(SHEETING_FAMILIES) family!: SheetingFamily;

  @ApiPropertyOptional({ description: 'Parámetros del modelo: F1, T, s…' })
  @IsOptional() @IsObject() vars?: Record<string, number>;

  @ApiProperty({ type: [PanelSpecDto], description: 'Geometría compilada' })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => PanelSpecDto) panels!: PanelSpecDto[];

  @ApiPropertyOptional() @IsOptional() @IsArray() blocks?: { block: string; params: Record<string, number | string | boolean> }[];
  @ApiPropertyOptional() @IsOptional() @IsObject() hems?: Record<string, { cm: number; fold: 'simple' | 'doble'; stitch?: 'simple' | 'doble' }>;
  @ApiPropertyOptional({ example: 20 }) @IsOptional() @IsInt() @Min(1) @Max(500) cutBatchUnits?: number;

  @ApiPropertyOptional({ type: [ModelSupplyDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ModelSupplyDto) supplies?: ModelSupplyDto[];

  @ApiPropertyOptional({ description: 'Rango válido por variable: { A: { min, max } }' })
  @IsOptional() @IsObject() validRange?: Record<string, { min: number; max: number }>;

  @ApiPropertyOptional({ description: 'Medidas de muestra para validar y previsualizar' })
  @IsOptional() @IsObject() sampleVars?: Record<string, number>;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
