import { useEffect, useState } from 'react';

export type ForecastDay = {
  name: string;
  high: number | null;
  low: number | null;
  short: string;
  precip: number | null;
};

export type Conditions = {
  ok: boolean;
  reason?: string;
  line: string;
  readAt: string;
  snow: { inches48: number; buckets: Array<{ startsAt: string; inches: number }> } | null;
  sundance: { days: ForecastDay[]; snow: { inches48: number } | null } | null;
  houses: Array<{ id: string; days: ForecastDay[] }>;
  alerts: Array<{ event: string; severity: string; headline: string; ends: string | null }>;
  plow: { dispatch: boolean; reason: string };
  road: { connected: boolean; line: string; winterAlert: boolean; reason?: string };
  sends: false;
};

type State =
  | { kind: 'loading' }
  | { kind: 'live'; conditions: Conditions }
  | { kind: 'off'; reason: string };

/**
 * The live forecast, read once, for whoever needs it.
 *
 * One fetch for the desk and one for the guest page, both from `/api/platform/conditions`. The route is host-only today, so a
 * guest page that asks for it gets a refusal and shows nothing rather than an invented number — the guest forecast is fed from
 * the field the stay route carries, not from this hook.
 */
export function useConditions(): State {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    let cancel = false;
    fetch('/api/platform/conditions', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(res.status === 401 ? 'sign-in required' : `the server answered ${res.status}`);
        return (await res.json()) as Conditions;
      })
      .then((conditions) => {
        if (!cancel) setState({ kind: 'live', conditions });
      })
      .catch((err: unknown) => {
        if (!cancel) setState({ kind: 'off', reason: err instanceof Error ? err.message : 'the read failed' });
      });
    return () => {
      cancel = true;
    };
  }, []);
  return state;
}

/** Three days in a row, compactly, or nothing when the read did not happen. */
export function forecastLine(days: ForecastDay[]): string {
  if (days.length === 0) return '';
  return days
    .slice(0, 3)
    .map((day) => {
      const high = day.high === null ? '' : ` ${day.high}°`;
      const low = day.low === null ? '' : `/${day.low}°`;
      return `${day.name}${high}${low}${day.short ? `, ${day.short.toLowerCase()}` : ''}`;
    })
    .join(' · ');
}

/** The snow figure as a sentence, or the honest absence of one. */
export function snowLine(conditions: Conditions): string {
  if (!conditions.ok) return 'The forecast could not be read. This is not clear weather.';
  if (!conditions.snow) return 'The weather service returned no snow figure for Sundance.';
  const inches = conditions.snow.inches48;
  return inches === 0
    ? 'No snow is forecast at Sundance over the next 48 hours.'
    : `${inches} in of snow is forecast at Sundance over the next 48 hours.`;
}
