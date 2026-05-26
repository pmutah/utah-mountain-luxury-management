import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import { currentYearMonth } from '../common/constants';
import { PortfolioService } from './portfolio.service';

@Controller('portfolio')
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get('metrics')
  getMetrics(@Query('month') month: string, @Query('compare') compare?: string) {
    return this.portfolioService.getPortfolioMetrics(month || currentYearMonth(), compare === '1');
  }

  @Get('history')
  getHistory(@Query('end') end: string, @Query('count') count?: string) {
    const endMonth = end || currentYearMonth();
    const n = Math.min(24, Math.max(1, Number(count ?? 12)));
    return this.portfolioService.getHistory(endMonth, n);
  }

  @Get('metrics/:propertyId')
  getPropertyMetrics(
    @Param('propertyId') propertyId: 'ranch' | 'lindon',
    @Query('month') month: string,
  ) {
    return this.portfolioService.getPropertyMetrics(propertyId, month || currentYearMonth());
  }

  @Get('extra-cleaning')
  getExtraCleaning() {
    return this.portfolioService.getExtraCleaningFees();
  }

  @Put('extra-cleaning')
  updateExtraCleaning(@Body() body: Record<string, number | string>) {
    return this.portfolioService.updateExtraCleaningFees(body);
  }
}
