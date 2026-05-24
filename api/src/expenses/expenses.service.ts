import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import type { Expense } from '../common/metrics';
import { EXPENSES } from '../seed/seed-data';

@Injectable()
export class ExpensesService {
  constructor(private readonly firebase: FirebaseService) {}

  async findAll(): Promise<Expense[]> {
    const snap = await this.firebase.collection('expenses').get();
    if (snap.empty) {
      return EXPENSES.map((e) => ({ ...e, propertyId: e.propertyId as Expense['propertyId'] }));
    }
    return snap.docs.map((d) => d.data() as Expense);
  }
}
