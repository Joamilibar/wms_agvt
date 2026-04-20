import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'operador@cabodehornos.cl' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ example: 'operator', enum: ['admin', 'supervisor', 'operator'] })
  @IsOptional()
  @IsIn(['admin', 'supervisor', 'operator'])
  role?: string;

  @ApiPropertyOptional({ example: 'Central' })
  @IsOptional()
  @IsString()
  warehouse?: string;
}
