import { IsString, IsOptional, IsNumber, Min, IsIn, MinLength, IsArray, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TRANSFER_DIRECTIONS } from '../schemas/transfer-order.schema.js';
import type { TransferDirection } from '../schemas/transfer-order.schema.js';

export class UpsertIdealDto {
  @ApiProperty({ example: '62697040648535' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiPropertyOptional({ example: 8, description: 'null borra el ideal manual y vuelve al calculado' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  ideal?: number | null;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  displayMin?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validFrom?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  validTo?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkIdealsDto {
  @ApiProperty({ type: [UpsertIdealDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertIdealDto)
  rows!: UpsertIdealDto[];
}

export class TransferOverrideDto {
  @IsString() @MinLength(1) sku!: string;
  @IsNumber() @Min(0) qty!: number;
  @IsOptional() @IsString() reason?: string;
}

export class CreateTransferDto {
  @ApiProperty({ enum: TRANSFER_DIRECTIONS })
  @IsIn(TRANSFER_DIRECTIONS)
  direction!: TransferDirection;

  @ApiPropertyOptional({ type: [TransferOverrideDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferOverrideDto)
  overrides?: TransferOverrideDto[];
}

export class UpdateTransferLineDto {
  @IsString() @MinLength(1) sku!: string;
  @IsNumber() @Min(0) qtyApproved!: number;
  @IsOptional() @IsString() reason?: string;
}

export class UpdateTransferDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => UpdateTransferLineDto) lines!: UpdateTransferLineDto[];
}
