import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';

import { ExpensesService } from './expenses.service';

import { GeminiExpenseParser, buildExpenseFromInput, type BulkExpenseInput } from './gemini-expense.parser';

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

  @Post('scan-batch')
  async scanBatch(
    @Body()
    body: {
      fileBase64?: string;
      mimeType?: string;
      fileName?: string;
    },
  ) {
    if (!body.fileBase64 || !body.mimeType) {
      return { error: 'fileBase64 and mimeType required' };
    }
    const expenses = await this.gemini.parseDocument(
      body.fileBase64,
      body.mimeType,
      body.fileName,
    );
    return { expenses, sourceFile: body.fileName ?? 'document' };
  }

  @Post('bulk')
  async bulk(@Body() body: { expenses?: BulkExpenseInput[] }) {
    const incoming = body.expenses ?? [];
    const toSave: Expense[] = [];
    const skipped: Array<{ reason: string; expense: BulkExpenseInput }> = [];

    for (const row of incoming) {
      if (row.propertyId !== 'ranch' && row.propertyId !== 'lindon') {
        skipped.push({ reason: 'Invalid propertyId', expense: row });
        continue;
      }
      if (!/^\d{4}-\d{2}$/.test(row.month)) {
        skipped.push({ reason: 'Invalid month', expense: row });
        continue;
      }
      const amount = Number(row.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        skipped.push({ reason: 'Invalid amount', expense: row });
        continue;
      }
      if (!row.category?.trim()) {
        skipped.push({ reason: 'Missing category', expense: row });
        continue;
      }
      toSave.push(buildExpenseFromInput({ ...row, amount }));
    }

    const result = await this.expensesService.addCustomBulk(toSave);
    return {
      saved: result.saved,
      skipped: [...skipped, ...result.skipped.map((s) => ({ reason: s.reason, expense: s.expense as BulkExpenseInput }))],
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
    const item: Expense = buildExpenseFromInput(body);
    return this.expensesService.addCustom(item);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const ok = this.expensesService.deleteCustom(id);
    if (!ok) return { error: 'Not found' };
    return { ok: true, id };
  }
}
