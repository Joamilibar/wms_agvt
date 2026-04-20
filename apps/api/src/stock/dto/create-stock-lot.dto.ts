import { IsString, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateStockLotDto {
  @ApiProperty({ example: 'SKU-001' })
  @IsString()
  sku!: string;

  @ApiProperty({ example: 'Plumón Ganso 400 Hilos King' })
  @IsString()
  name!: string;

  @ApiProperty({ example: 'L2024-001' })
  @IsString()
  lot!: string;

  @ApiProperty({ example: '2024-03-15T00:00:00.000Z' })
  @IsDateString()
  entryDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(1)
  qty!: number;

  @ApiPropertyOptional({ example: 'A-01-01' })
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ example: 185000 })
  @IsNumber()
  @Min(0)
  unitCost!: number;

  @ApiPropertyOptional({ example: 'Central' })
  @IsOptional()
  @IsString()
  warehouse?: string;

  @ApiPropertyOptional({ example: 'Proveedor Textil SA' })
  @IsOptional()
  @IsString()
  supplier?: string;
}
