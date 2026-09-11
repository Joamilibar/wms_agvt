import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CreateOrderDto } from './dto/create-order.dto.js';
import { ProcessFifoDto } from './dto/process-fifo.dto.js';
import { QueryOrdersDto } from './dto/query-orders.dto.js';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders (paginated)' })
  async findAll(@Query() query: QueryOrdersDto) {
    // @Query('page') without a DTO never even reached the pipe as a number.
    return this.ordersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  async findById(@Param('id') id: string) {
    return this.ordersService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new picking order' })
  @ApiResponse({ status: 201, description: 'Order created' })
  async create(
    @Body() body: CreateOrderDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.ordersService.create({ ...body, createdBy: userId });
  }

  @Patch(':id/start')
  @ApiOperation({ summary: 'Start processing an order' })
  async startOrder(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.ordersService.startOrder(id, userId);
  }

  @Post(':id/process-fifo')
  @ApiOperation({ summary: 'Execute FIFO picking (transactional)' })
  @ApiResponse({ status: 200, description: 'FIFO processing result with lot traceability' })
  async processFIFO(
    @Param('id') id: string,
    @Body() body: ProcessFifoDto,
    @CurrentUser('userId') userId: string,
  ) {
    return this.ordersService.processFIFO(id, body.items, userId);
  }

  @Post(':id/cancel')
  @Roles('admin', 'supervisor')
  @ApiOperation({ summary: 'Cancel an order' })
  async cancelOrder(@Param('id') id: string) {
    return this.ordersService.cancelOrder(id);
  }

  @Get(':id/traceability')
  @ApiOperation({ summary: 'Get lot traceability for an order' })
  async getTraceability(@Param('id') id: string) {
    return this.ordersService.getTraceability(id);
  }
}
