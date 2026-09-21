import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

// ── demand events ────────────────────────────────────────────────────────────

export class CreateEventDto {
  @ApiProperty({ example: 'Cyber Day' })
  @IsString() @MinLength(1) @MaxLength(120) name!: string;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString() from!: string;

  @ApiProperty({ example: '2026-11-30' })
  @IsDateString() to!: string;

  @ApiPropertyOptional({ type: [String], description: 'Vacío = todas las categorías' })
  @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true }) skus?: string[];

  @ApiProperty({ example: 1.5, description: 'Multiplicador sobre la demanda del mes' })
  @IsNumber() @Min(0) @Max(10) uplift!: number;

  @ApiPropertyOptional({ enum: ['history', 'manual'] })
  @IsOptional() @IsIn(['history', 'manual']) source?: 'history' | 'manual';

  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class UpdateEventDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() from?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() to?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) categories?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) skus?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(10) uplift?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

// ── projects ─────────────────────────────────────────────────────────────────

export class ProjectLineDto {
  @IsString() @MinLength(1) sku!: string;
  @IsNumber() @Min(0) qty!: number;
}

export class CreateProjectDto {
  @ApiProperty({ example: 'Hotel Cumbres' })
  @IsString() @MinLength(1) @MaxLength(200) customer!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) rut?: string;

  @ApiPropertyOptional({ example: '2026-12-15' })
  @IsOptional() @IsDateString() requiredDate?: string;

  @ApiPropertyOptional({ description: 'Bodega desde la que se reserva al confirmar' })
  @IsOptional() @IsString() warehouse?: string;

  @ApiProperty({ type: [ProjectLineDto] })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => ProjectLineDto) lines!: ProjectLineDto[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateProjectDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(1) @MaxLength(200) customer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) rut?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() requiredDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() warehouse?: string;
  @ApiPropertyOptional({ type: [ProjectLineDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ProjectLineDto) lines?: ProjectLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
