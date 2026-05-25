import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { GeminiExpenseParser } from './gemini-expense.parser';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService, GeminiExpenseParser],
  exports: [ExpensesService],
})
export class ExpensesModule {}
