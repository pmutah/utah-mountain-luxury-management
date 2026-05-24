import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { calculateMetrics, type PropertyMetrics } from '../common/metrics';
import type { PropertyId } from '../common/constants';
import { DEFAULT_EXTRA_CLEANING } from '../seed/seed-data';
import { ReservationsService } from '../reservations/reservations.service';
import { ExpensesService } from '../expenses/expenses.service';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly reservationsService: ReservationsService,
    private readonly expensesService: ExpensesService,
  ) {}

  async getExtraCleaningFees(): Promise<Record<string, number>> {
    const doc = await this.firebase.collection('settings').doc('extraCleaningFees').get();
    if (!doc.exists) return { ...DEFAULT_EXTRA_CLEANING };
    return doc.data() as Record<string, number>;
  }

  async updateExtraCleaningFees(body: Record<string, number | string>) {
    const current = await this.getExtraCleaningFees();
    const next: Record<string, number> = { ...current };
    for (const [key, val] of Object.entries(body)) {
      const num = Number(val);
      if (!Number.isFinite(num) || num <= 0) {
        delete next[key];
      } else {
        next[key] = num;
      }
    }
    await this.firebase.collection('settings').doc('extraCleaningFees').set(next);
    return next;
  }

  async getPropertyMetrics(propertyId: PropertyId, month: string): Promise<PropertyMetrics> {
    const [reservations, expenses, extraCleaningFees] = await Promise.all([
      this.reservationsService.findAll(),
      this.expensesService.findAll(),
      this.getExtraCleaningFees(),
    ]);
    return calculateMetrics(propertyId, month, reservations, expenses, extraCleaningFees);
  }

  async getPortfolioMetrics(month: string) {
    const [ranch, lindon, reservations, expenses, extraCleaningFees, properties] =
      await Promise.all([
        this.getPropertyMetrics('ranch', month),
        this.getPropertyMetrics('lindon', month),
        this.reservationsService.findAll(),
        this.expensesService.findAll(),
        this.getExtraCleaningFees(),
        this.firebase.collection('properties').get(),
      ]);

    const propertyList = properties.empty
      ? null
      : properties.docs.map((d) => d.data());

    return {
      month,
      ranch,
      lindon,
      totalRevenue: ranch.revenue + lindon.revenue,
      totalProfit: ranch.profit + lindon.profit,
      avgOccupancy: (ranch.occupancy + lindon.occupancy) / 2,
      reservations,
      expenses,
      extraCleaningFees,
      properties: propertyList,
    };
  }
}
