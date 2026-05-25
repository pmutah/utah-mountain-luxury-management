import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { GeminiExpenseParser } from './gemini-expense.parser';
import type { Expense } from '../common/metrics';

@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly expensesService: ExpensesService,
    private readonly gemini: GeminiExpenseParser,
  ) {}

  @Get()
  findAll() {
    return this.expensesService.findAll();
  }

  @Post('scan')
  async scan(
    @Body()
    body: {
      type: 'text' | 'image';
      text?: string;
      imageBase64?: string;
      mimeType?: string;
      propertyId?: 'ranch' | 'lindon';
      month?: string;
    },
  ) {
    const hints = { propertyId: body.propertyId, month: body.month };
    const parsed =
      body.type === 'image'
        ? await this.gemini.parseImage(body.imageBase64!, body.mimeType!, hints)
        : await this.gemini.parseText(body.text!, hints);
    return {
      ...parsed,
      propertyId: parsed.propertyId ?? body.propertyId ?? null,
      month: parsed.month || body.month || '',
    };
  }

  @Post()
  async create(
    @Body()
    body: {
      propertyId: 'ranch' | 'lindon';
      month: string;
      category: string;
      amount: number;
      note?: string;
      vendor?: string;
    },
  ) {
    const item: Expense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      propertyId: body.propertyId,
      month: body.month,
      category: body.category,
      amount: Number(body.amount),
      note: body.note,
      vendor: body.vendor,
    };
    return this.expensesService.addCustom(item);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const ok = this.expensesService.deleteCustom(id);
    if (!ok) return { error: 'Not found' };
    return { ok: true, id };
  }
}
