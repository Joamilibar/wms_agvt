import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

/**
 * The controller wms.md specified and the codebase never had: UsersService was
 * complete but unreachable, so there was no way to administer users at all —
 * which became the missing counterpart once public registration was closed.
 */
@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'List users (passwords never returned)' })
  async findAll() {
    return this.usersService.findAllPublic();
  }

  @Get(':id')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Get a user by id' })
  async findById(@Param('id') id: string) {
    return this.usersService.findPublicById(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Create a user with a role' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.createUser(dto);
  }

  @Patch(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Update a user role, warehouse, name, password or status' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser('userId') actingUserId: string,
  ) {
    return this.usersService.updateUser(id, dto, actingUserId);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({
    summary: 'Disable a user',
    description: 'Soft delete: sets isActive=false so the audit trail on their orders survives.',
  })
  async remove(@Param('id') id: string, @CurrentUser('userId') actingUserId: string) {
    return this.usersService.deactivateUser(id, actingUserId);
  }
}
