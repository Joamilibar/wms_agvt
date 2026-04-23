import { Controller, Get, Post, Param, Query, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { BsaleService } from './bsale.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';

@ApiTags('BSale')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bsale')
export class BsaleController {
  constructor(private bsaleService: BsaleService) {}

  @Get('status')
  @ApiOperation({ summary: 'BSale connection status' })
  async getStatus() {
    return this.bsaleService.getStatus();
  }

  @Post('test-connection')
  @ApiOperation({ summary: 'Test BSale API connection' })
  async testConnection() {
    return this.bsaleService.testConnection();
  }

  @Get('documents')
  @ApiOperation({ summary: 'Get active documents from BSale (with search)' })
  async getDocuments(
    @Query('limit') limit?: number,
    @Query('officeid') officeid?: string,
    @Query('number') number?: string,
  ) {
    return this.bsaleService.getDocuments({ limit: limit || 25, officeid, number });
  }

  @Get('offices')
  @ApiOperation({ summary: 'Get BSale offices' })
  async getOffices() {
    return this.bsaleService.getOffices();
  }

  @Get('clients')
  @ApiOperation({ summary: 'Get BSale clients (searchable by company name)' })
  async getClients(@Query('q') q?: string) {
    return this.bsaleService.getClients(q);
  }

  @Get('documents/:id/details')
  @ApiOperation({ summary: 'Get details of a BSale document' })
  async getDocumentDetails(@Param('id') id: string) {
    return this.bsaleService.getDocumentDetails(parseInt(id, 10));
  }

  @Get('stocks/bulk')
  @ApiOperation({ summary: 'Get stock for multiple variants in an office' })
  async getStocksBulk(
    @Query('officeid') officeid: string,
    @Query('variantids') variantids: string,
  ) {
    if (!officeid || !variantids) return {};
    return this.bsaleService.getStocksForVariants(officeid, variantids.split(',').filter(Boolean));
  }

  @Post('sync-stock')
  @ApiOperation({ summary: 'Sync BSale stock consumptions into MongoDB StockLots' })
  async syncStock(@Body() body: { clearExisting?: boolean }) {
    return this.bsaleService.syncStockFromBsale(body?.clearExisting !== false);
  }
}
