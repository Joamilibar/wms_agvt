import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrdersService } from './orders.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';

@ApiTags('Orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders (paginated)' })
  async findAll(
    @Query('status') status?: string,
    @Query('warehouse') warehouse?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ordersService.findAll({ status, warehouse, page, limit });
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
    @Body() body: {
      client: string;
      originType?: string;
      bsaleDocumentId?: string;
      bsaleDocumentNumber?: string;
      bsaleOfficeId?: number;
      type?: string;
      priority?: string;
      warehouse?: string;
      destinationType?: string;
      generateGuide?: boolean;
      bsaleClientId?: number;
      bsaleDestinationOfficeId?: number;
      items: { sku: string; name: string; requestedQty: number }[];
      notes?: string;
    },
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
    @Body() body: { items: { sku: string; qty: number }[] },
    @CurrentUser('userId') userId: string,
  ) {
    return this.ordersService.processFIFO(id, body.items, userId);
  }

  @Post(':id/cancel')
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
