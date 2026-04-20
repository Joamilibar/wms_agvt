import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard KPIs and alerts' })
  async getDashboard(@Query('warehouse') warehouse?: string) {
    return this.analyticsService.getDashboardKPIs(warehouse);
  }

  @Get('abc')
  @ApiOperation({ summary: 'ABC Analysis (Pareto)' })
  async getABC(
    @Query('warehouse') warehouse?: string,
    @Query('days') days?: number,
  ) {
    return this.analyticsService.computeABC(warehouse, days || 90);
  }

  @Get('coverage')
  @ApiOperation({ summary: 'Coverage days per SKU' })
  async getCoverage(@Query('warehouse') warehouse?: string) {
    return this.analyticsService.computeCoverage(warehouse);
  }

  @Get('aging')
  @ApiOperation({ summary: 'Aging report per lot' })
  async getAging(@Query('warehouse') warehouse?: string) {
    return this.analyticsService.computeAging(warehouse);
  }

  @Get('aging/summary')
  @ApiOperation({ summary: 'Aging summary by bucket' })
  async getAgingSummary(@Query('warehouse') warehouse?: string) {
    return this.analyticsService.getAgingSummary(warehouse);
  }

  @Get('sales-trend/:sku')
  @ApiOperation({ summary: 'Sales trend for a SKU' })
  async getSalesTrend(
    @Param('sku') sku: string,
    @Query('days') days?: number,
  ) {
    return this.analyticsService.getSalesTrend(sku, days || 30);
  }
}
