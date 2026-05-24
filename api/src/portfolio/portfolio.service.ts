import { Injectable } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { calculateMetrics, type PropertyMetrics } from '../common/metrics';
import type { PropertyId } from '../common/constants';
import { DEFAULT_EXTRA_CLEANING } from '../seed/seed-data';
import { ReservationsService } from '../reservations/reservations.service';
import { ExpensesService } from '../expenses/expenses.service';
import { PROPERTIES } from '../common/constants';

@Injectable()
export class PortfolioService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly reservationsService: ReservationsService,
    private readonly expensesService: ExpensesService,
  ) {}

  async getExtraCleaningFees(): Promise<Record<string, number>> {
    return this.firebase.getSetting('extraCleaningFees', { ...DEFAULT_EXTRA_CLEANING });
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
    await this.firebase.setSetting('extraCleaningFees', next);
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

  private addMonths(ym: string, delta: number): string {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  async getPortfolioMetrics(month: string, compare = false) {
    const [ranch, lindon, reservations, expenses, extraCleaningFees] = await Promise.all([
      this.getPropertyMetrics('ranch', month),
      this.getPropertyMetrics('lindon', month),
      this.reservationsService.findAll(),
      this.expensesService.findAll(),
      this.getExtraCleaningFees(),
    ]);

    const fromDb = await this.firebase.listCollection('properties');

    const payload: Record<string, unknown> = {
      month,
      ranch,
      lindon,
      totalRevenue: ranch.revenue + lindon.revenue,
      totalProfit: ranch.profit + lindon.profit,
      avgOccupancy: (ranch.occupancy + lindon.occupancy) / 2,
      reservations,
      expenses,
      extraCleaningFees,
      properties: fromDb ?? Object.values(PROPERTIES),
    };

    if (compare) {
      const prevMonth = this.addMonths(month, -1);
      const [prevRanch, prevLindon] = await Promise.all([
        this.getPropertyMetrics('ranch', prevMonth),
        this.getPropertyMetrics('lindon', prevMonth),
      ]);
      payload.previousMonth = prevMonth;
      payload.previous = {
        ranch: prevRanch,
        lindon: prevLindon,
        totalRevenue: prevRanch.revenue + prevLindon.revenue,
        totalProfit: prevRanch.profit + prevLindon.profit,
        avgOccupancy: (prevRanch.occupancy + prevLindon.occupancy) / 2,
      };
    }

    return payload;
  }

  async getHistory(endMonth: string, count: number) {
    const extraCleaningFees = await this.getExtraCleaningFees();
    const [reservations, expenses] = await Promise.all([
      this.reservationsService.findAll(),
      this.expensesService.findAll(),
    ]);
    const months = Array.from({ length: count }, (_, i) =>
      this.addMonths(endMonth, i - count + 1),
    );
    const history = months.map((month) => {
      const ranch = calculateMetrics('ranch', month, reservations, expenses, extraCleaningFees);
      const lindon = calculateMetrics('lindon', month, reservations, expenses, extraCleaningFees);
      return {
        month,
        ranch: {
          revenue: ranch.revenue,
          profit: ranch.profit,
          occupancy: ranch.occupancy,
          stayCount: ranch.stayCount,
        },
        lindon: {
          revenue: lindon.revenue,
          profit: lindon.profit,
          occupancy: lindon.occupancy,
          stayCount: lindon.stayCount,
        },
        totalRevenue: ranch.revenue + lindon.revenue,
        totalProfit: ranch.profit + lindon.profit,
        avgOccupancy: (ranch.occupancy + lindon.occupancy) / 2,
      };
    });
    return { endMonth, count, history, reservations };
  }
}
