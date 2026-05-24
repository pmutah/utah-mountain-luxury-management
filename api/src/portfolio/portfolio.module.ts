import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';
import { ReservationsModule } from '../reservations/reservations.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [ReservationsModule, ExpensesModule],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}
