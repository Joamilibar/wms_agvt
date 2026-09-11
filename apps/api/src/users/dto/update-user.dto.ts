import { IsString, MinLength, IsOptional, IsIn, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { USER_ROLES } from './create-user.dto.js';

/**
 * Email is deliberately not updatable: it is the login identity and the unique
 * key, so changing it is a create-and-migrate, not a field edit.
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Juan Perez' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ enum: USER_ROLES })
  @IsOptional()
  @IsIn(USER_ROLES as unknown as string[])
  role?: string;

  @ApiPropertyOptional({ example: 'Norte' })
  @IsOptional()
  @IsString()
  warehouse?: string;

  @ApiPropertyOptional({ description: 'Set false to disable the account' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Only send to reset the password', minLength: 8 })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
