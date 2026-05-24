import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import type { Expense } from '../common/metrics';
import { EXPENSES } from '../seed/seed-data';

@Injectable()
export class ExpensesService {
  constructor(private readonly firebase: FirebaseService) {}

  async findAll(): Promise<Expense[]> {
    const fromDb = await this.firebase.listCollection<Expense>('expenses');
    if (fromDb) return fromDb;
    return EXPENSES.map((e) => ({
      ...e,
      propertyId: e.propertyId as Expense['propertyId'],
    }));
  }
}
