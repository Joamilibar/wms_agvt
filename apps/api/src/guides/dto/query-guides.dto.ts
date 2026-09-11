import { IsOptional, IsNumber, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryGuidesDto {
  @ApiPropertyOptional({ enum: ['internal', 'external'] })
  @IsOptional()
  @IsIn(['internal', 'external'])
  type?: string;

  @ApiPropertyOptional({ enum: ['draft', 'emitted', 'in_transit', 'received', 'cancelled'] })
  @IsOptional()
  @IsIn(['draft', 'emitted', 'in_transit', 'received', 'cancelled'])
  status?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  // Capped: an uncapped limit turns any list endpoint into a full-collection dump.
  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
