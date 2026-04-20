import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { StockService } from './stock.service.js';
import { CreateStockLotDto } from './dto/create-stock-lot.dto.js';
import { QueryStockDto } from './dto/query-stock.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@ApiTags('Stock')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('stock')
export class StockController {
  constructor(private stockService: StockService) {}

  @Get()
  @ApiOperation({ summary: 'List active stock lots (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated list of stock lots' })
  async findAll(@Query() query: QueryStockDto) {
    return this.stockService.findAll(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Stock summary grouped by SKU' })
  @ApiResponse({ status: 200, description: 'Stock summary per SKU' })
  async getSummary(@Query('warehouse') warehouse?: string) {
    return this.stockService.getSummary(warehouse);
  }

  @Get('warehouses')
  @ApiOperation({ summary: 'List all warehouses' })
  async getWarehouses() {
    return this.stockService.getWarehouses();
  }

  @Get('fifo/:sku')
  @ApiOperation({ summary: 'Get FIFO-ordered lots for a SKU' })
  @ApiResponse({ status: 200, description: 'FIFO-ordered lots' })
  async getFifo(@Param('sku') sku: string, @Query('warehouse') warehouse?: string) {
    return this.stockService.findFifoBySku(sku, warehouse);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new stock lot' })
  @ApiResponse({ status: 201, description: 'Stock lot created' })
  async create(@Body() dto: CreateStockLotDto, @CurrentUser('userId') userId: string) {
    return this.stockService.create(dto, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Adjust stock lot quantity' })
  async adjustQty(@Param('id') id: string, @Body('qty') qty: number) {
    return this.stockService.adjustQty(id, qty);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate a stock lot' })
  async deactivate(@Param('id') id: string) {
    return this.stockService.deactivate(id);
  }
}
