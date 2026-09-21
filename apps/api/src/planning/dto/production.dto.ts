import { IsString, IsOptional, IsNumber, Min, IsIn, MinLength, IsArray, ArrayNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UOMS } from '../schemas/bom-recipe.schema.js';
import type { Uom } from '../schemas/bom-recipe.schema.js';

export class RecipeComponentDto {
  @ApiProperty({ example: '62697042741719' })
  @IsString() @MinLength(1) sku!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;

  @ApiProperty({ example: 1.03, description: 'Cantidad por unidad del producto' })
  @IsNumber() @Min(0) qty!: number;

  @ApiPropertyOptional({ enum: UOMS, default: 'un' })
  @IsOptional() @IsIn(UOMS) uom?: Uom;

  @ApiPropertyOptional({ example: 0.03, description: 'Merma de este componente; null usa el parámetro global' })
  @IsOptional() @IsNumber() @Min(0) scrapPct?: number | null;
}

export class UpsertRecipeDto {
  @ApiProperty({ example: '62697039809495' })
  @IsString() @MinLength(1) parentSku!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;

  @ApiProperty({ type: [RecipeComponentDto] })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => RecipeComponentDto) components!: RecipeComponentDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class ImportRecipesDto {
  @ApiProperty({ type: [UpsertRecipeDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => UpsertRecipeDto) recipes!: UpsertRecipeDto[];
}

export class PlanRequestDto {
  @IsString() @MinLength(1) sku!: string;
  @IsNumber() @Min(0) qty!: number;
}

export class ProductionPlanDto {
  @ApiPropertyOptional({ type: [PlanRequestDto], description: 'Cantidades a producir; sin esto usa las sugeridas de la corrida' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PlanRequestDto) requests?: PlanRequestDto[];
}

export class ProductionLineDto {
  @IsString() @MinLength(1) sku!: string;
  @IsNumber() @Min(0) qty!: number;
  @IsOptional() @IsString() reason?: string;
}

export class CreateProductionOrderDto {
  @ApiProperty({ example: 'Taller Sapru San Vicente' })
  @IsString() @MinLength(1) workshop!: string;

  @ApiPropertyOptional({ default: 'Bodega Virtual Tienda' })
  @IsOptional() @IsString() destinationWarehouse?: string;

  @ApiProperty({ type: [ProductionLineDto] })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => ProductionLineDto) lines!: ProductionLineDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CompleteProductionDto {
  @ApiProperty({ type: [PlanRequestDto], description: 'Lo efectivamente producido por SKU' })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => PlanRequestDto) produced!: PlanRequestDto[];
}
