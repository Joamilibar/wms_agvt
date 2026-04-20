import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PickingLogService } from './picking-log.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';

@ApiTags('Picking Log')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('picking-log')
export class PickingLogController {
  constructor(private readonly logService: PickingLogService) {}

  @Get()
  @ApiOperation({ summary: 'Get all picking log events' })
  async findAll() {
    return this.logService.findAll();
  }

  @Get('order/:id')
  @ApiOperation({ summary: 'Get log events by Order ID' })
  async findByOrderId(@Param('id') id: string) {
    return this.logService.findByOrderId(id);
  }
}
