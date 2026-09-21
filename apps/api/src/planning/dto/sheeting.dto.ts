import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
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

export class BlockRefDto {
  @IsString() @Matches(/^[a-z_]+$/) block!: string;
  @IsObject() params!: Record<string, number | string | boolean>;
}

export class SaveModelDto {
  @ApiProperty({ example: 'ENCIMERA_CRUCERO' })
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{2,39}$/, { message: 'code: mayúsculas, números y guión bajo' }) code!: string;

  @ApiProperty() @IsString() @MinLength(1) @MaxLength(120) name!: string;

  @ApiProperty({ enum: SHEETING_FAMILIES })
  @IsIn(SHEETING_FAMILIES) family!: SheetingFamily;

  @ApiPropertyOptional({ description: 'Parámetros del modelo: F1, T, s…' })
  @IsOptional() @IsObject() vars?: Record<string, number>;

  @ApiPropertyOptional({ type: [PanelSpecDto], description: 'Geometría compilada; se ignora cuando vienen bloques' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PanelSpecDto) panels?: PanelSpecDto[];

  @ApiPropertyOptional({ type: [BlockRefDto], description: 'Lista ordenada de bloques; se compila al guardar' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BlockRefDto) blocks?: BlockRefDto[];
  @ApiPropertyOptional() @IsOptional() @IsObject() hems?: Record<string, { cm: number; fold: 'simple' | 'doble'; stitch?: 'simple' | 'doble' }>;
  @ApiPropertyOptional({ example: 20 }) @IsOptional() @IsInt() @Min(1) @Max(500) cutBatchUnits?: number;

  @ApiPropertyOptional({ type: [ModelSupplyDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ModelSupplyDto) supplies?: ModelSupplyDto[];

  @ApiPropertyOptional({ description: 'Rango válido por variable: { A: { min, max } }' })
  @IsOptional() @IsObject() validRange?: Record<string, { min: number; max: number }>;

  @ApiPropertyOptional({ description: 'Medidas de muestra para validar y previsualizar' })
  @IsOptional() @IsObject() sampleVars?: Record<string, number>;

  @ApiPropertyOptional({ description: 'Empaque por unidad, CLP' }) @IsOptional() @IsNumber() @Min(0) packagingClp?: number;
  @ApiPropertyOptional({ description: 'Traslado por unidad, CLP' }) @IsOptional() @IsNumber() @Min(0) freightClp?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class PreviewModelDto extends SaveModelDto {
  @ApiPropertyOptional({ description: 'Tela del centro para el encaje; omitida = la primera activa' })
  @IsOptional() @IsString() fabricSku?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() frameFabricSku?: string;
  @ApiPropertyOptional({ description: 'Medidas de prueba; omitidas = sampleVars del modelo' })
  @IsOptional() @IsObject() measures?: Record<string, number>;
  @ApiPropertyOptional() @IsOptional() @IsString() workshop?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() channel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sizeLabel?: string;
}

export class DuplicateModelDto {
  @ApiProperty({ example: 'ENCIMERA_CRUCERO_LINO' })
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{2,39}$/, { message: 'code: mayúsculas, números y guión bajo' }) code!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) name?: string;
}

// ── workshop rates ───────────────────────────────────────────────────────────

export class UpsertRateDto {
  @ApiProperty({ example: 'Taller Santa Cruz Los Lirios' })
  @IsString() @MinLength(1) workshop!: string;

  @ApiProperty({ example: 'ENCIMERA_CRUCERO' })
  @IsString() @MinLength(1) modelCode!: string;

  @ApiPropertyOptional({ example: 'Queen', description: 'null = todo el modelo' })
  @IsOptional() @IsString() @MaxLength(40) sizeLabel?: string | null;

  @ApiPropertyOptional({ example: '500TC', description: 'Calidad de la tela base; null = cualquiera' })
  @IsOptional() @IsString() @MaxLength(40) quality?: string | null;

  @ApiProperty({ example: 14000, description: 'CLP por unidad terminada' })
  @IsNumber() @Min(0) rate!: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() validTo?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

// ── quote ────────────────────────────────────────────────────────────────────

export class QuoteDto {
  @ApiProperty({ example: 'ENCIMERA_CRUCERO' })
  @IsString() @MinLength(1) modelCode!: string;

  @ApiPropertyOptional({ description: 'Versión concreta; omitido = la activa' })
  @IsOptional() @IsInt() @Min(1) modelVersion?: number;

  @ApiProperty({ example: '63845371893523' })
  @IsString() @MinLength(1) fabricSku!: string;

  @ApiPropertyOptional({ description: 'Tela del marco (slot "marco") si es de color; omitida = la misma del centro' })
  @IsOptional() @IsString() frameFabricSku?: string;

  @ApiProperty({ example: { A: 255, L: 290 }, description: 'Medidas en cm: A ancho, L largo, H altura de colchón (bajera)' })
  @IsObject() measures!: Record<string, number>;

  @ApiProperty({ example: 20 })
  @IsInt() @Min(1) @Max(100000) qty!: number;

  @ApiProperty({ example: 'Taller Santa Cruz Los Lirios' })
  @IsString() @MinLength(1) workshop!: string;

  @ApiProperty({ example: 'tienda' })
  @IsString() @MinLength(1) @MaxLength(40) channel!: string;

  @ApiPropertyOptional({ example: 'Queen', description: 'Talla de la lista de precios del taller' })
  @IsOptional() @IsString() @MaxLength(40) sizeLabel?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(500) cutBatchUnits?: number;
}

// ── saved quotes ─────────────────────────────────────────────────────────────

export class SaveQuoteDto extends QuoteDto {
  @ApiPropertyOptional({ description: 'SKU del producto terminado; necesario para congelar como receta' })
  @IsOptional() @IsString() productSku?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
