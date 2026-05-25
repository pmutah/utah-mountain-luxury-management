import { Injectable } from '@nestjs/common';

import { FirebaseService } from '../firebase/firebase.service';

import type { Expense } from '../common/metrics';

import { EXPENSES } from '../seed/seed-data';



const customExpenses: Expense[] = [];



@Injectable()

export class ExpensesService {

  constructor(private readonly firebase: FirebaseService) {}



  async findAll(): Promise<Expense[]> {

    const base = await this.getBaseExpenses();

    return [...base, ...customExpenses];

  }



  getCustomExpenses(): Expense[] {

    return customExpenses;

  }



  async addCustom(expense: Expense): Promise<Expense> {

    customExpenses.push(expense);

    return expense;

  }



  async addCustomBulk(expenses: Expense[]): Promise<{ saved: Expense[]; skipped: Array<{ reason: string; expense: Expense }> }> {

    const saved: Expense[] = [];

    const skipped: Array<{ reason: string; expense: Expense }> = [];

    const keys = new Set(

      customExpenses.map((e) => `${e.propertyId}|${e.month}|${(e.vendor ?? '').toLowerCase()}|${e.amount}`),

    );



    for (const expense of expenses) {

      const key = `${expense.propertyId}|${expense.month}|${(expense.vendor ?? '').toLowerCase()}|${expense.amount}`;

      if (keys.has(key)) {

        skipped.push({ reason: 'Duplicate', expense });

        continue;

      }

      customExpenses.push(expense);

      keys.add(key);

      saved.push(expense);

    }



    return { saved, skipped };

  }



  deleteCustom(id: string): boolean {

    const idx = customExpenses.findIndex((e) => e.id === id);

    if (idx === -1) return false;

    customExpenses.splice(idx, 1);

    return true;

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


