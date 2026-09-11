import {
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsBoolean,
  IsIn,
  IsArray,
  ArrayNotEmpty,
  Min,
  ValidateNested,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOrderItemDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiProperty({ example: 'Filete de Merluza 1kg' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 10, description: 'Must be greater than zero' })
  @IsNumber()
  @IsPositive()
  requestedQty!: number;

  @ApiPropertyOptional({
    example: 4500,
    description: 'Net unit sale price from the BSale document line, when the order comes from one',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

/**
 * The controller used to type this body inline. Inline types carry no runtime
 * metadata, so the global ValidationPipe had nothing to validate against and
 * let the whole payload through — including negative quantities and empty
 * item lists.
 */
export class CreateOrderDto {
  @ApiProperty({ example: 'Restaurante Los Robles' })
  @IsString()
  @MinLength(1)
  client!: string;

  @ApiPropertyOptional({ enum: ['picking', 'replenishment'] })
  @IsOptional()
  @IsIn(['picking', 'replenishment'])
  type?: string;

  @ApiPropertyOptional({ enum: ['high', 'normal', 'low'] })
  @IsOptional()
  @IsIn(['high', 'normal', 'low'])
  priority?: string;

  @ApiPropertyOptional({
    enum: ['manual', 'bsale_factura', 'bsale_boleta', 'bsale_guia', 'bsale_auto'],
  })
  @IsOptional()
  @IsIn(['manual', 'bsale_factura', 'bsale_boleta', 'bsale_guia', 'bsale_auto'])
  originType?: string;

  @ApiPropertyOptional({ enum: ['client', 'internal_production', 'store_restock'] })
  @IsOptional()
  @IsIn(['client', 'internal_production', 'store_restock'])
  destinationType?: string;

  @ApiPropertyOptional({ example: 'Central' })
  @IsOptional()
  @IsString()
  warehouse?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  generateGuide?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bsaleDocumentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bsaleDocumentNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bsaleOfficeId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bsaleClientId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  bsaleDestinationOfficeId?: number;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'An order must contain at least one item' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
