import {
  IsString,
  IsOptional,
  IsNumber,
  IsPositive,
  IsIn,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateGuideItemLotDto {
  @ApiProperty({ example: 'L-2026-001' })
  @IsString()
  @MinLength(1)
  lot!: string;

  @ApiProperty({ example: 4 })
  @IsNumber()
  @IsPositive()
  qty!: number;
}

export class CreateGuideItemDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiProperty({ example: 'Filete de Merluza 1kg' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @IsPositive()
  qty!: number;

  @ApiProperty({ example: 4500 })
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @ApiPropertyOptional({ description: 'BSale variant id for this line' })
  @IsOptional()
  @IsString()
  bsaleVariantId?: string;

  @ApiPropertyOptional({ type: [CreateGuideItemLotDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGuideItemLotDto)
  lots?: CreateGuideItemLotDto[];
}

/**
 * Only the fields a client may set.
 *
 * The endpoint previously took `Record<string, unknown>` and did
 * `create({ ...body } as any)`, which let a caller hand-set `status`,
 * `guideId`, `orderId`, `emittedAt` and the whole `bsale*` block — that is,
 * declare a draft already emitted and synced. Those are server-owned and are
 * deliberately absent here; with `forbidNonWhitelisted` on, sending one is a 400.
 */
export class CreateGuideDto {
  @ApiProperty({ enum: ['internal', 'external'] })
  @IsIn(['internal', 'external'])
  type!: string;

  @ApiPropertyOptional({ description: 'External guides: receiving client' })
  @IsOptional()
  @IsString()
  client?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientRut?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clientAddress?: string;

  @ApiPropertyOptional({ description: 'Internal guides: origin warehouse' })
  @IsOptional()
  @IsString()
  originWarehouse?: string;

  @ApiPropertyOptional({ description: 'Internal guides: destination warehouse' })
  @IsOptional()
  @IsString()
  destinationWarehouse?: string;

  @ApiProperty({ type: [CreateGuideItemDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'A guide must contain at least one item' })
  @ValidateNested({ each: true })
  @Type(() => CreateGuideItemDto)
  items!: CreateGuideItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
