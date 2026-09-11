import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const USER_ROLES = ['admin', 'supervisor', 'operator'] as const;

/**
 * Creating a user with a role is an administrative act, which is why it lives
 * here behind @Roles('admin') and not in the anonymous /auth/register (B-03).
 */
export class CreateUserDto {
  @ApiProperty({ example: 'operador@cabodehornos.cl' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Juan Perez' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: USER_ROLES, default: 'operator' })
  @IsIn(USER_ROLES as unknown as string[])
  role!: string;

  @ApiPropertyOptional({ example: 'Central' })
  @IsOptional()
  @IsString()
  warehouse?: string;
}
