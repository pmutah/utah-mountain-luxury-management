import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
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

  @Get(':id/receipt')
  async getReceipt(@Param('id') id: string, @Res({ passthrough: true }) res: Response) {
    const { buffer, contentType } = await this.expensesService.getReceiptFile(id);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(buffer);
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
  async bulk(@Body() body: { expenses?: (BulkExpenseInput & { receiptBase64?: string; receiptMimeType?: string })[] }) {
    const incoming = body.expenses ?? [];
    const saved: Expense[] = [];
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

      const item = buildExpenseFromInput({ ...row, amount });
      let receipt: { buffer: Buffer; mimeType: string } | undefined;
      if (row.receiptBase64 && row.receiptMimeType) {
        receipt = {
          buffer: Buffer.from(row.receiptBase64, 'base64'),
          mimeType: row.receiptMimeType,
        };
      }

      const keys = new Set(
        [...(await this.expensesService.findAll()), ...saved].map(
          (e) => `${e.propertyId}|${e.month}|${(e.vendor ?? '').toLowerCase()}|${e.amount}`,
        ),
      );
      const key = `${item.propertyId}|${item.month}|${(item.vendor ?? '').toLowerCase()}|${item.amount}`;
      if (keys.has(key)) {
        skipped.push({ reason: 'Duplicate', expense: row });
        continue;
      }

      try {
        saved.push(await this.expensesService.addCustom(item, receipt));
      } catch (e) {
        skipped.push({
          reason: e instanceof Error ? e.message : 'Save failed',
          expense: row,
        });
      }
    }

    return { saved, skipped };
  }

  @Post()
  async create(
    @Body()
    body: BulkExpenseInput & {
      receiptBase64?: string;
      receiptMimeType?: string;
    },
  ) {
    const item = buildExpenseFromInput(body);
    let receipt: { buffer: Buffer; mimeType: string } | undefined;
    if (body.receiptBase64 && body.receiptMimeType) {
      receipt = {
        buffer: Buffer.from(body.receiptBase64, 'base64'),
        mimeType: body.receiptMimeType,
      };
    }
    return this.expensesService.addCustom(item, receipt);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const ok = await this.expensesService.deleteCustom(id);
    if (!ok) return { error: 'Not found' };
    return { ok: true, id };
  }
}
