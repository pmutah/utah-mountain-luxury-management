import { useEffect, useState } from 'react';
import type { HouseId } from './market/types';
import type { RiverFlow } from './platform/river-flow';

export type PublicForecastDay = {
  name: string;
  high: number | null;
  low: number | null;
  short: string;
  precip: number | null;
};

export type PublicAlert = {
  event: string;
  severity: string;
  headline: string;
  ends: string | null;
};

export type PublicConditions = {
  ok: boolean;
  readAt: string;
  sundance: {
    days: PublicForecastDay[];
    snow48: number | null;
  } | null;
  houses: Array<{
    id: HouseId;
    label: string;
    days: PublicForecastDay[];
  }>;
  river: RiverFlow;
  alerts: PublicAlert[];
  advisory: string;
  note: string;
  sends: false;
};

export type PublicConditionsState =
  | { kind: 'loading' }
  | { kind: 'live'; data: PublicConditions }
  | { kind: 'off'; reason: string };

let sharedPromise: Promise<PublicConditions> | null = null;
let sharedExpiresAt = 0;

export function resetPublicConditionsClientCache(): void {
  sharedPromise = null;
  sharedExpiresAt = 0;
}

export async function loadPublicConditions(fetchImpl: typeof fetch = fetch): Promise<PublicConditions> {
  const now = Date.now();
  if (sharedPromise && sharedExpiresAt > now) return sharedPromise;

  const next = fetchImpl('/api/public/conditions', { headers: { Accept: 'application/json' } }).then(async (res) => {
    if (!res.ok) throw new Error(`Weather service answered ${res.status}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) throw new Error('Weather response was not JSON');
    return (await res.json()) as PublicConditions;
  });

  sharedPromise = next;
  sharedExpiresAt = now + 120_000;
  next.catch(() => {
    if (sharedPromise === next) {
      sharedPromise = null;
      sharedExpiresAt = 0;
    }
  });
  return next;
}

export function usePublicConditions(): PublicConditionsState {
  const [state, setState] = useState<PublicConditionsState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    loadPublicConditions()
      .then((data) => {
        if (!cancelled) setState({ kind: 'live', data });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({
            kind: 'off',
            reason: err instanceof Error ? err.message : 'Live conditions could not be read.',
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export function formatDayPill(day: PublicForecastDay | undefined): string {
  if (!day) return '';
  const temps =
    day.high !== null && day.low !== null
      ? `${day.high}°/${day.low}°F`
      : day.high !== null
        ? `${day.high}°F`
        : day.low !== null
          ? `${day.low}°F`
          : '';
  return [day.name, temps, day.short].filter(Boolean).join(' · ');
}

export function formatSundanceBadge(sundance: PublicConditions['sundance']): string {
  if (!sundance) return 'Sundance forecast unavailable';
  const lead = sundance.days[0];
  const snow =
    sundance.snow48 === null
      ? ''
      : sundance.snow48 > 0
        ? `${sundance.snow48}" snow next 48h`
        : '0" snow next 48h';
  const temp = lead?.high !== null && lead?.high !== undefined ? `${lead.high}°F` : '';
  const parts = ['Sundance', temp, snow, lead?.short ?? ''].filter(Boolean);
  return parts.join(' · ');
}

export function formatRiverBadge(river: RiverFlow | undefined): string {
  if (!river) return 'Provo River gauge unread';
  if (!river.ok) return 'Provo River gauge could not be read';
  const stateWord =
    river.state === 'prime' ? 'Prime wading' : river.state === 'swift' ? 'Swift current' : 'High runoff';
  const temp = river.tempF !== null ? ` · ${river.tempF}°F water` : '';
  return `Provo River ${Math.round(river.cfs)} cfs${temp} · ${stateWord}`;
}
