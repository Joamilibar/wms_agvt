import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  IsIn,
  MinLength,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PO_STATUSES } from '../schemas/purchase-order.schema.js';
import type { PoStatus } from '../schemas/purchase-order.schema.js';

export class PurchaseOrderLineDto {
  @ApiProperty({ example: '62697040648535' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: 140 })
  @IsNumber()
  @Min(0)
  qtyOrdered!: number;

  @ApiPropertyOptional({ example: '2026-10-15', description: 'Fecha estimada de llegada' })
  @IsOptional()
  @IsDateString()
  eta?: string | null;

  @ApiPropertyOptional({ example: 4.4, description: 'Costo unitario en la moneda de la orden' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number | null;
}

export class CreatePurchaseOrderDto {
  @ApiPropertyOptional({ example: 'BAMBOOLYO' })
  @IsOptional()
  @IsString()
  supplierName?: string;

  @ApiPropertyOptional({ enum: PO_STATUSES, default: 'approved' })
  @IsOptional()
  @IsIn(PO_STATUSES)
  status?: PoStatus;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  fxRate?: number | null;

  @ApiPropertyOptional({ default: 'Bodega Virtual Tienda' })
  @IsOptional()
  @IsString()
  destinationWarehouse?: string;

  @ApiProperty({ type: [PurchaseOrderLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PurchaseOrderLineDto)
  lines!: PurchaseOrderLineDto[];

  @ApiPropertyOptional({ example: 'initial_transit' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
