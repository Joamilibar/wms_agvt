import { IsString, IsOptional, IsNumber, Min, IsIn, IsBoolean, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { MOQ_SCOPES } from '../schemas/supplier.schema.js';
import type { MoqScope } from '../schemas/supplier.schema.js';

export class CreateSupplierDto {
  @ApiProperty({ example: 'BAMBOOLYO' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 70, description: 'Días de producción en el proveedor' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  leadTimeDays?: number;

  @ApiPropertyOptional({ example: 50, description: 'Días de tránsito hasta la bodega' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  transitDays?: number;

  @ApiPropertyOptional({ example: 90, description: 'Cada cuántos días se pide' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  cadenceDays?: number;

  @ApiPropertyOptional({ example: 2000, description: 'Mínimo del pedido completo en unidades' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  containerMin?: number | null;

  @ApiPropertyOptional({ enum: MOQ_SCOPES })
  @IsOptional()
  @IsIn(MOQ_SCOPES)
  moqScope?: MoqScope;

  @ApiPropertyOptional({ example: 1.25, description: 'FOB × factor = costo desembarcado' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  landedFactor?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {}
