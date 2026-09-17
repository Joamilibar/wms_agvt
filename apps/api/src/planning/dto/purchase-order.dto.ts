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

export class ReceiveLineDto {
  @ApiProperty({ example: '62697040648535' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiProperty({ example: 140, description: 'Unidades recibidas ahora' })
  @IsNumber()
  @Min(0)
  qty!: number;

  @ApiPropertyOptional({ example: 'A-01-02' })
  @IsOptional()
  @IsString()
  location?: string;
}

export class ReceivePurchaseOrderDto {
  @ApiProperty({ type: [ReceiveLineDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReceiveLineDto)
  lines!: ReceiveLineDto[];

  @ApiPropertyOptional({ example: 950, description: 'Tipo de cambio a CLP; obligatorio si la orden no lo trae' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fxRate?: number | null;

  @ApiPropertyOptional({ example: '2026-10-15' })
  @IsOptional()
  @IsDateString()
  receivedAt?: string;
}

export class UpdateDraftLineDto {
  @IsString() @MinLength(1) sku!: string;
  @IsNumber() @Min(0) qtyOrdered!: number;
  @IsOptional() @IsDateString() eta?: string | null;
  @IsOptional() @IsNumber() @Min(0) unitCost?: number | null;
}

export class UpdateDraftPurchaseOrderDto {
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => UpdateDraftLineDto) lines?: UpdateDraftLineDto[];
  @IsOptional() @IsNumber() @Min(0) fxRate?: number | null;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() destinationWarehouse?: string;
}

export class RunOverrideDto {
  @IsString() @MinLength(1) sku!: string;
  @IsNumber() @Min(0) qty!: number;
  @IsOptional() @IsString() reason?: string;
}

export class CreateOrderFromRunDto {
  @ApiPropertyOptional({ description: 'ObjectId del proveedor; omitir para el grupo sin proveedor' })
  @IsOptional() @IsString() supplierId?: string | null;

  @ApiPropertyOptional({ type: [RunOverrideDto], description: 'Cantidades distintas a la sugerida, con motivo' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => RunOverrideDto) overrides?: RunOverrideDto[];
}
