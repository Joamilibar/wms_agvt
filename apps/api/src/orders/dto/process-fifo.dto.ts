import {
  IsString,
  IsNumber,
  IsPositive,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ProcessFifoItemDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiProperty({ example: 5, description: 'Units actually picked; must be > 0' })
  @IsNumber()
  @IsPositive()
  qty!: number;
}

export class ProcessFifoDto {
  @ApiProperty({ type: [ProcessFifoItemDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Nothing to process: send at least one picked item' })
  @ValidateNested({ each: true })
  @Type(() => ProcessFifoItemDto)
  items!: ProcessFifoItemDto[];
}
