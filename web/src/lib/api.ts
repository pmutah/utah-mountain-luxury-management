const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  cleaningFee: number;
  accentColor: string;
  mortgage: number;
}

export interface Reservation {
  id: string;
  guestName: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  payout: number;
  source: string;
}

export interface Expense {
  id: string;
  month: string;
  propertyId: string;
  category: string;
  amount: number;
}

export interface OwnerDistribution {
  brandon: number;
  todd: number;
  mgtFee: number;
}

export interface PropertyMetrics {
  propertyId: string;
  revenue: number;
  baseCleaning: number;
  extra: number;
  totalCleaning: number;
  mortgage: number;
  operationalExpenses: number;
  profit: number;
  occupancy: number;
  stayCount: number;
  dist: OwnerDistribution | null;
}

export interface PortfolioData {
  month: string;
  ranch: PropertyMetrics;
  lindon: PropertyMetrics;
  totalRevenue: number;
  totalProfit: number;
  avgOccupancy: number;
  reservations: Reservation[];
  expenses: Expense[];
  extraCleaningFees: Record<string, number>;
}

export const api = {
  getPortfolio: (month: string) =>
    request<PortfolioData>(`/api/portfolio/metrics?month=${encodeURIComponent(month)}`),
  updateExtraCleaning: (fees: Record<string, number | string>) =>
    request<Record<string, number>>('/api/portfolio/extra-cleaning', {
      method: 'PUT',
      body: JSON.stringify(fees),
    }),
};

export const PROPERTIES: Record<string, Property> = {
  ranch: {
    id: 'ranch',
    name: 'The Ranch House',
    address: '270 E Center St',
    cleaningFee: 350,
    accentColor: 'bg-blue-500',
    mortgage: 3133.36,
  },
  lindon: {
    id: 'lindon',
    name: 'The Lindon House',
    address: '1011 E 100 N',
    cleaningFee: 160,
    accentColor: 'bg-emerald-500',
    mortgage: 1265.14,
  },
};

export const RANCH_MORTGAGE = 3133.36;
export const LINDON_MORTGAGE = 1265.14;

export function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(val || 0);
}
