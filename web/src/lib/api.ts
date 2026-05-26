const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:8080');

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(detail || `API ${path} failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export type CreateExpenseInput = {
  propertyId: string;
  month: string;
  category: string;
  amount: number;
  file?: File | null;
};

export type UpdateExpenseInput = {
  category?: string;
  amount?: number;
  file?: File | null;
};

function expenseFormData(fields: Record<string, string | number>, file?: File | null): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  if (file) form.append('file', file);
  return form;
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
  receiptStoragePath?: string | null;
  receiptContentType?: string | null;
  receiptUploadedAt?: string | null;
  /** Signed URL from API when a receipt exists (not stored in Firestore). */
  receiptUrl?: string | null;
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
  previousMonth?: string;
  previous?: {
    ranch: PropertyMetrics;
    lindon: PropertyMetrics;
    totalRevenue: number;
    totalProfit: number;
    avgOccupancy: number;
  };
}

export interface MonthHistoryPoint {
  month: string;
  ranch: { revenue: number; profit: number; occupancy: number; stayCount: number };
  lindon: { revenue: number; profit: number; occupancy: number; stayCount: number };
  totalRevenue: number;
  totalProfit: number;
  avgOccupancy: number;
}

export interface HistoryData {
  endMonth: string;
  count: number;
  history: MonthHistoryPoint[];
  reservations: Reservation[];
}

export interface SessionInfo {
  authenticated: boolean;
  authRequired: boolean;
}

export const api = {
  getSession: () => request<SessionInfo>('/api/auth/session'),
  login: (password: string) =>
    request<SessionInfo>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),
  getPortfolio: (month: string, compare = true) =>
    request<PortfolioData>(
      `/api/portfolio/metrics?month=${encodeURIComponent(month)}${compare ? '&compare=1' : ''}`,
    ),
  getHistory: (endMonth: string, count = 12) =>
    request<HistoryData>(
      `/api/portfolio/history?end=${encodeURIComponent(endMonth)}&count=${count}`,
    ),
  updateExtraCleaning: (fees: Record<string, number | string>) =>
    request<Record<string, number>>('/api/portfolio/extra-cleaning', {
      method: 'PUT',
      body: JSON.stringify(fees),
    }),
  createExpense: (input: CreateExpenseInput) =>
    request<Expense>('/api/expenses', {
      method: 'POST',
      body: expenseFormData(
        {
          propertyId: input.propertyId,
          month: input.month,
          category: input.category,
          amount: input.amount,
        },
        input.file,
      ),
    }),
  updateExpense: (id: string, input: UpdateExpenseInput) =>
    request<Expense>(`/api/expenses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: expenseFormData(
        {
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
        },
        input.file,
      ),
    }),
  deleteExpense: (id: string) =>
    request<void>(`/api/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  receiptUrl: (expenseId: string) =>
    `${API_URL}/api/expenses/${encodeURIComponent(expenseId)}/receipt`,
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
