import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ArrayNotEmpty,
  ValidateNested,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PackComponentDto } from './create-pack-recipe.dto.js';

/** `packSku` is the identity of the recipe and is not editable here. */
export class UpdatePackRecipeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bsaleVariantId?: string;

  @ApiPropertyOptional({ type: [PackComponentDto] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty({ message: 'Un pack sin componentes no tiene stock que calcular' })
  @ValidateNested({ each: true })
  @Type(() => PackComponentDto)
  components?: PackComponentDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
