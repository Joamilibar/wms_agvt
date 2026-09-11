import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshDto {
  @ApiProperty({ description: 'The opaque refresh token returned by login or a previous refresh' })
  @IsString()
  @MinLength(20)
  refresh_token!: string;
}
