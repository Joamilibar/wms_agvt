import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'operador@cabodehornos.cl' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'Juan Perez' })
  @IsString()
  @MinLength(2)
  name!: string;

  // `role` and `warehouse` are deliberately NOT accepted here: this endpoint is
  // anonymous, so honouring them let anyone POST {"role":"admin"} and receive an
  // administrator JWT in the same response. Privileged accounts are created by an
  // admin through the users module.
}
