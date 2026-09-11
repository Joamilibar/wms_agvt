import {
  IsString,
  IsOptional,
  IsNumber,
  IsInt,
  Min,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PackComponentDto {
  @ApiProperty({ example: '69282466855209', description: 'SKU del componente' })
  @IsString()
  @MinLength(1)
  sku!: string;

  @ApiProperty({ example: 'Sábana bajera King Crucero blanco' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: '2049', description: 'Variante BSale del componente' })
  @IsOptional()
  @IsString()
  bsaleVariantId?: string;

  @ApiProperty({
    example: 2,
    description: 'Unidades de este componente que consume un pack. Entero, mínimo 1.',
  })
  @IsInt()
  @Min(1)
  qtyPerPack!: number;
}

export class CreatePackRecipeDto {
  @ApiProperty({ example: '69282466855209', description: 'SKU del pack en BSale' })
  @IsString()
  @MinLength(1)
  packSku!: string;

  @ApiProperty({ example: 'Juego de sábanas King Crucero blanco/blanco' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: '3509' })
  @IsOptional()
  @IsString()
  bsaleVariantId?: string;

  @ApiProperty({ type: [PackComponentDto] })
  @IsArray()
  @ArrayNotEmpty({ message: 'Un pack sin componentes no tiene stock que calcular' })
  @ValidateNested({ each: true })
  @Type(() => PackComponentDto)
  components!: PackComponentDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
