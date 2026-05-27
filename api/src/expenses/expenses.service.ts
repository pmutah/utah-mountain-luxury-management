import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import type { Expense } from '../common/metrics';
import { EXPENSES } from '../seed/seed-data';
import {
  RECEIPT_ALLOWED_MIME,
  RECEIPT_MAX_BYTES,
  buildReceiptStoragePath,
} from './receipt.constants';

const customExpenses: Expense[] = [];

@Injectable()
export class ExpensesService {
  constructor(private readonly firebase: FirebaseService) {}

  private attachReceiptUrl(expense: Expense): Expense {
    return {
      ...expense,
      receiptUrl: expense.receiptStoragePath
        ? `/api/expenses/${encodeURIComponent(expense.id)}/receipt`
        : null,
    };
  }

  async findAll(): Promise<Expense[]> {
    const base = await this.getBaseExpenses();
    return [...base, ...customExpenses].map((e) => this.attachReceiptUrl(e));
  }

  getCustomExpenses(): Expense[] {
    return customExpenses.map((e) => this.attachReceiptUrl(e));
  }

  findCustomById(id: string): Expense | undefined {
    return customExpenses.find((e) => e.id === id);
  }

  async addCustom(
    expense: Expense,
    receipt?: { buffer: Buffer; mimeType: string },
  ): Promise<Expense & { receiptWarning?: string }> {
    let receiptWarning: string | undefined;
    if (receipt) {
      if (!RECEIPT_ALLOWED_MIME.has(receipt.mimeType)) {
        receiptWarning = 'Unsupported file type for receipt storage. Expense was saved.';
      } else if (!this.firebase.storageEnabled) {
        receiptWarning =
          'Receipt not stored — configure FIREBASE_SERVICE_ACCOUNT_JSON. Expense was saved.';
      } else {
        try {
          if (receipt.buffer.length > RECEIPT_MAX_BYTES) {
            receiptWarning = 'Receipt over 10 MB — not stored. Expense was saved.';
          } else {
            const path = buildReceiptStoragePath(expense.propertyId, expense.id, receipt.mimeType);
            await this.firebase.uploadReceipt(path, receipt.buffer, receipt.mimeType);
            expense = {
              ...expense,
              receiptStoragePath: path,
              receiptContentType: receipt.mimeType,
              receiptUploadedAt: new Date().toISOString(),
            };
          }
        } catch (e) {
          receiptWarning = `Receipt not stored (${e instanceof Error ? e.message : 'upload failed'}). Expense was saved.`;
        }
      }
    }
    if (receiptWarning) {
      expense = {
        ...expense,
        note: expense.note ? `${expense.note} · ${receiptWarning}` : receiptWarning,
      };
    }
    customExpenses.push(expense);
    return { ...this.attachReceiptUrl(expense), receiptWarning };
  }

  async addCustomBulk(expenses: Expense[]): Promise<{
    saved: Expense[];
    skipped: Array<{ reason: string; expense: Expense }>;
  }> {
    const saved: Expense[] = [];
    const skipped: Array<{ reason: string; expense: Expense }> = [];
    const keys = new Set(
      customExpenses.map(
        (e) => `${e.propertyId}|${e.month}|${(e.vendor ?? '').toLowerCase()}|${e.amount}`,
      ),
    );

    for (const expense of expenses) {
      const key = `${expense.propertyId}|${expense.month}|${(expense.vendor ?? '').toLowerCase()}|${expense.amount}`;
      if (keys.has(key)) {
        skipped.push({ reason: 'Duplicate', expense });
        continue;
      }
      customExpenses.push(expense);
      keys.add(key);
      saved.push(this.attachReceiptUrl(expense));
    }

    return { saved, skipped };
  }

  async deleteCustom(id: string): Promise<boolean> {
    const idx = customExpenses.findIndex((e) => e.id === id);
    if (idx === -1) return false;
    const expense = customExpenses[idx]!;
    if (expense.receiptStoragePath) {
      await this.firebase.deleteReceipt(expense.receiptStoragePath);
    }
    customExpenses.splice(idx, 1);
    return true;
  }

  async getReceiptFile(id: string): Promise<{ buffer: Buffer; contentType: string }> {
    const expense = this.findCustomById(id);
    if (!expense?.receiptStoragePath) {
      throw new NotFoundException('No receipt for this expense');
    }
    if (!this.firebase.storageEnabled) {
      throw new ServiceUnavailableException('Firebase Storage not configured');
    }
    return this.firebase.downloadReceipt(expense.receiptStoragePath);
  }

  private async getBaseExpenses(): Promise<Expense[]> {
    const fromDb = await this.firebase.listCollection<Expense>('expenses');
    if (fromDb) return fromDb;
    return EXPENSES.map((e) => ({
      ...e,
      propertyId: e.propertyId as Expense['propertyId'],
    }));
  }
}
