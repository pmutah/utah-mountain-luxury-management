import type { Expense, Reservation } from './api';

export type SearchHit = {
  id: string;
  label: string;
  detail: string;
  kind: 'route' | 'stay' | 'expense' | 'doc';
  tab?: string;
  report?: 'pnl' | 'documents';
  river?: 'rental' | 'build' | 'launch';
  stayId?: string;
};

const ROUTES: SearchHit[] = [
  { id: 'overview', label: 'Overview', detail: 'Morning desk', kind: 'route', tab: 'portfolio' },
  { id: 'calendar', label: 'Calendar', detail: 'Tape chart', kind: 'route', tab: 'calendar' },
  { id: 'guests', label: 'Guests', detail: 'Stays and requests', kind: 'route', tab: 'guests' },
  { id: 'clean', label: 'Clean', detail: 'Turnovers', kind: 'route', tab: 'clean' },
  { id: 'market', label: 'Market', detail: 'Rates and gaps', kind: 'route', tab: 'market' },
  { id: 'report', label: 'Report', detail: 'Management', kind: 'route', tab: 'report', report: 'pnl' },
  { id: 'documents', label: 'Documents', detail: 'Vault', kind: 'route', tab: 'report', report: 'documents' },
  { id: 'owner', label: 'Owner statement', detail: 'Todd split', kind: 'route', tab: 'owner' },
  { id: 'ours', label: 'Our expenses', detail: 'Household', kind: 'route', tab: 'ours' },
  { id: 'ranch', label: 'Ranch', detail: 'House', kind: 'route', tab: 'ranch' },
  { id: 'lindon', label: 'Lindon', detail: 'House', kind: 'route', tab: 'lindon' },
  { id: 'river', label: 'River rental', detail: 'House', kind: 'route', tab: 'river', river: 'rental' },
  { id: 'opening', label: 'Opening', detail: 'River launch', kind: 'route', tab: 'river', river: 'launch' },
  { id: 'build', label: 'Build costs', detail: 'Construction', kind: 'route', tab: 'river', river: 'build' },
  { id: 'agents', label: 'Agents', detail: 'Co-host tools', kind: 'route', tab: 'agents' },
];

function score(text: string, query: string): number {
  const hay = text.toLowerCase();
  const needle = query.toLowerCase().trim();
  if (!needle) return 0;
  if (hay === needle) return 100;
  if (hay.startsWith(needle)) return 80;
  if (hay.includes(needle)) return 50;
  const parts = needle.split(/\s+/).filter(Boolean);
  if (parts.length > 1 && parts.every((part) => hay.includes(part))) return 40;
  return 0;
}

export function omnibarHits(input: {
  query: string;
  reservations?: readonly Pick<Reservation, 'id' | 'guestName' | 'confirmationCode' | 'checkIn' | 'propertyId' | 'status'>[];
  expenses?: readonly Pick<Expense, 'id' | 'vendor' | 'category' | 'amount' | 'note' | 'propertyId' | 'month'>[];
  documents?: readonly { id: string; name: string }[];
  hideLindon?: boolean;
}): SearchHit[] {
  const query = input.query.trim();
  const hits: Array<SearchHit & { rank: number }> = [];
  for (const route of ROUTES) {
    if (input.hideLindon && route.id === 'lindon') continue;
    const rank = Math.max(score(route.label, query), score(route.detail, query));
    if (rank) hits.push({ ...route, rank });
  }
  for (const stay of input.reservations ?? []) {
    if (input.hideLindon && stay.propertyId === 'lindon') continue;
    const rank = Math.max(
      score(stay.guestName, query),
      score(stay.confirmationCode ?? '', query),
      score(stay.checkIn, query),
      score(`${stay.propertyId} ${stay.guestName}`, query),
    );
    if (!rank) continue;
    hits.push({
      id: `stay:${stay.id}`,
      label: stay.guestName,
      detail: `${stay.propertyId} · ${stay.checkIn}${stay.status ? ` · ${stay.status}` : ''}`,
      kind: 'stay',
      tab: 'guests',
      stayId: stay.id,
      rank,
    });
  }
  for (const expense of input.expenses ?? []) {
    if (input.hideLindon && expense.propertyId === 'lindon') continue;
    const rank = Math.max(
      score(expense.vendor ?? '', query),
      score(expense.category, query),
      score(expense.note ?? '', query),
      score(String(expense.amount), query),
    );
    if (!rank) continue;
    const tab = expense.propertyId === 'household' ? 'ours' : expense.propertyId === 'construction' ? 'river' : expense.propertyId;
    hits.push({
      id: `expense:${expense.id}`,
      label: expense.vendor || expense.category,
      detail: `${expense.propertyId} · ${expense.month} · $${expense.amount}`,
      kind: 'expense',
      tab: tab === 'ranch' || tab === 'lindon' || tab === 'river' || tab === 'ours' ? tab : 'report',
      river: expense.propertyId === 'construction' ? 'build' : undefined,
      rank,
    });
  }
  for (const doc of input.documents ?? []) {
    const rank = score(doc.name, query);
    if (!rank) continue;
    hits.push({
      id: `doc:${doc.id}`,
      label: doc.name,
      detail: 'Construction document',
      kind: 'doc',
      tab: 'river',
      river: 'build',
      rank,
    });
  }
  return hits
    .sort((a, b) => b.rank - a.rank || a.label.localeCompare(b.label))
    .slice(0, 8)
    .map(({ rank: _rank, ...hit }) => hit);
}
