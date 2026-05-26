import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FirebaseService } from '../firebase/firebase.service';
import type { Expense } from '../common/metrics';
import { EXPENSES } from '../seed/seed-data';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import {
  RECEIPT_ALLOWED_MIME,
  RECEIPT_MAX_BYTES,
  receiptStoragePath as buildReceiptStoragePath,
} from './expenses.constants';
import type { ReceiptUploadFile } from './expenses.types';

type StoredExpense = Omit<Expense, 'receiptUrl'>;

@Injectable()
export class ExpensesService {
  private memoryExpenses: StoredExpense[] | null = null;

  constructor(private readonly firebase: FirebaseService) {}

  private seedExpenses(): StoredExpense[] {
    return EXPENSES.map((e) => ({
      ...e,
      propertyId: e.propertyId as StoredExpense['propertyId'],
      receiptStoragePath: null,
      receiptContentType: null,
      receiptUploadedAt: null,
    }));
  }

  private async loadStored(): Promise<StoredExpense[]> {
    if (!this.firebase.enabled) {
      if (!this.memoryExpenses) {
        this.memoryExpenses = this.seedExpenses();
      }
      return this.memoryExpenses;
    }
    const fromDb = await this.firebase.listCollection<StoredExpense>('expenses');
    if (fromDb?.length) return fromDb;
    return this.seedExpenses();
  }

  private async persistOne(expense: StoredExpense): Promise<void> {
    if (!this.firebase.enabled) {
      const list = await this.loadStored();
      const idx = list.findIndex((e) => e.id === expense.id);
      if (idx >= 0) list[idx] = expense;
      else list.push(expense);
      this.memoryExpenses = list;
      return;
    }
    const { receiptUrl: _omit, ...doc } = expense as StoredExpense & { receiptUrl?: string };
    await this.firebase.collection('expenses').doc(expense.id).set(doc);
  }

  private async removeOne(id: string): Promise<void> {
    if (!this.firebase.enabled) {
      const list = await this.loadStored();
      this.memoryExpenses = list.filter((e) => e.id !== id);
      return;
    }
    await this.firebase.collection('expenses').doc(id).delete();
  }

  private validateReceiptFile(file: ReceiptUploadFile): void {
    if (!RECEIPT_ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Receipt must be JPEG, PNG, or WebP');
    }
    if (file.size > RECEIPT_MAX_BYTES) {
      throw new BadRequestException('Receipt must be 10 MB or smaller');
    }
  }

  private async attachReceiptUrl(expense: StoredExpense): Promise<Expense> {
    if (!expense.receiptStoragePath) {
      return { ...expense, receiptUrl: null };
    }
    if (!this.firebase.storageEnabled) {
      return { ...expense, receiptUrl: null };
    }
    try {
      const receiptUrl = await this.firebase.getSignedReadUrl(expense.receiptStoragePath);
      return { ...expense, receiptUrl };
    } catch {
      return { ...expense, receiptUrl: null };
    }
  }

  async findAll(): Promise<Expense[]> {
    const stored = await this.loadStored();
    return Promise.all(stored.map((e) => this.attachReceiptUrl(e)));
  }

  async findOne(id: string): Promise<Expense> {
    const stored = await this.loadStored();
    const expense = stored.find((e) => e.id === id);
    if (!expense) throw new NotFoundException(`Expense ${id} not found`);
    return this.attachReceiptUrl(expense);
  }

  async create(dto: CreateExpenseDto, file?: ReceiptUploadFile): Promise<Expense> {
    const id = `exp-${randomUUID()}`;
    let receiptStoragePath: string | null = null;
    let receiptContentType: string | null = null;
    let receiptUploadedAt: string | null = null;

    if (file) {
      this.validateReceiptFile(file);
      if (!this.firebase.storageEnabled) {
        throw new ServiceUnavailableException(
          'Receipt upload requires Firebase Storage (enable Storage and set service account credentials)',
        );
      }
      receiptContentType = file.mimetype;
      receiptStoragePath = buildReceiptStoragePath(dto.propertyId, id, file.mimetype);
      await this.firebase.uploadReceipt(receiptStoragePath, file.buffer, file.mimetype);
      receiptUploadedAt = new Date().toISOString();
    }

    const expense: StoredExpense = {
      id,
      month: dto.month,
      propertyId: dto.propertyId,
      category: dto.category,
      amount: dto.amount,
      receiptStoragePath,
      receiptContentType,
      receiptUploadedAt,
    };
    await this.persistOne(expense);
    return this.attachReceiptUrl(expense);
  }

  async update(
    id: string,
    dto: UpdateExpenseDto,
    file?: ReceiptUploadFile,
  ): Promise<Expense> {
    const stored = await this.loadStored();
    const idx = stored.findIndex((e) => e.id === id);
    if (idx < 0) throw new NotFoundException(`Expense ${id} not found`);

    let expense: StoredExpense = { ...stored[idx] };

    if (dto.category !== undefined) expense.category = dto.category;
    if (dto.amount !== undefined) expense.amount = dto.amount;

    if (file) {
      this.validateReceiptFile(file);
      if (!this.firebase.storageEnabled) {
        throw new ServiceUnavailableException(
          'Receipt upload requires Firebase Storage (enable Storage and set service account credentials)',
        );
      }
      if (expense.receiptStoragePath) {
        await this.firebase.deleteReceipt(expense.receiptStoragePath);
      }
      const contentType = file.mimetype;
      const path = buildReceiptStoragePath(expense.propertyId, id, contentType);
      await this.firebase.uploadReceipt(path, file.buffer, contentType);
      expense = {
        ...expense,
        receiptStoragePath: path,
        receiptContentType: contentType,
        receiptUploadedAt: new Date().toISOString(),
      };
    }

    stored[idx] = expense;
    if (this.firebase.enabled) {
      await this.persistOne(expense);
    } else {
      this.memoryExpenses = stored;
    }
    return this.attachReceiptUrl(expense);
  }

  async remove(id: string): Promise<void> {
    const stored = await this.loadStored();
    const expense = stored.find((e) => e.id === id);
    if (!expense) throw new NotFoundException(`Expense ${id} not found`);

    if (expense.receiptStoragePath && this.firebase.storageEnabled) {
      await this.firebase.deleteReceipt(expense.receiptStoragePath);
    }
    await this.removeOne(id);
  }

  async getReceiptRedirectUrl(id: string): Promise<string> {
    const expense = await this.findOne(id);
    if (!expense.receiptStoragePath) {
      throw new NotFoundException('This expense has no receipt');
    }
    if (!this.firebase.storageEnabled) {
      throw new ServiceUnavailableException('Firebase Storage not configured');
    }
    return this.firebase.getSignedReadUrl(expense.receiptStoragePath);
  }
}
