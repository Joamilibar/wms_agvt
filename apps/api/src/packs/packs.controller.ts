import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { PacksService } from './packs.service.js';
import { CreatePackRecipeDto } from './dto/create-pack-recipe.dto.js';
import { UpdatePackRecipeDto } from './dto/update-pack-recipe.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';

@ApiTags('Packs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('packs')
export class PacksController {
  constructor(private packsService: PacksService) {}

  @Get('availability')
  @ApiOperation({
    summary: 'Stock calculado de los packs',
    description:
      'BSale no lleva stock de los packs (unlimitedStock=1) ni expone su composición, ' +
      'así que se calcula desde los componentes: el mínimo de stock/qtyPerPack, por bodega. ' +
      '`limitedBy` nombra el componente que topa el total.',
  })
  async availability(
    @Query('warehouse') warehouse?: string,
    @Query('sku') sku?: string,
  ) {
    return this.packsService.availability({ warehouse, packSku: sku });
  }

  @Get()
  @ApiOperation({ summary: 'Listar recetas de packs' })
  async findAll(@Query('includeInactive') includeInactive?: string) {
    return this.packsService.findAll(includeInactive === 'true');
  }

  @Get(':sku')
  @ApiOperation({ summary: 'Receta de un pack' })
  async findBySku(@Param('sku') sku: string) {
    return this.packsService.findBySku(sku);
  }

  @Post()
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Definir la receta de un pack' })
  @ApiResponse({ status: 409, description: 'Ya existe una receta para ese SKU' })
  async create(@Body() dto: CreatePackRecipeDto) {
    return this.packsService.create(dto);
  }

  @Patch(':sku')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Actualizar la receta de un pack' })
  async update(@Param('sku') sku: string, @Body() dto: UpdatePackRecipeDto) {
    return this.packsService.update(sku, dto);
  }

  @Delete(':sku')
  @Roles('admin', 'supervisor')
  @ApiOperation({
    summary: 'Desactivar la receta',
    description: 'Baja lógica: la receta deja de calcularse pero su historia se conserva.',
  })
  async remove(@Param('sku') sku: string) {
    return this.packsService.remove(sku);
  }
}
