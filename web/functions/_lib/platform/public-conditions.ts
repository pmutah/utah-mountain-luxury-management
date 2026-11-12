import { HOUSE_POINTS, readConditions, type Alert, type ForecastDay } from './weather';
import { readRiverFlow, type RiverFlow } from './river-flow';

export type PublicConditionsPayload = {
  ok: boolean;
  readAt: string;
  sundance: {
    days: ForecastDay[];
    snow48: number | null;
  } | null;
  houses: Array<{
    id: 'ranch' | 'lindon' | 'river';
    label: string;
    days: ForecastDay[];
  }>;
  river: RiverFlow;
  alerts: Alert[];
  advisory: string;
  note: string;
  sends: false;
};

export async function buildPublicConditions(
  fetchImpl: typeof fetch,
  now: Date = new Date(),
): Promise<PublicConditionsPayload> {
  const [conditions, river] = await Promise.all([
    readConditions(fetchImpl, now),
    readRiverFlow(fetchImpl),
  ]);

  const winterAlerts = conditions.alerts.filter((alert) =>
    /winter|snow|ice|storm|wind|fog|flood|avalanche/i.test(alert.event),
  );

  const advisory =
    winterAlerts.length > 0
      ? `${winterAlerts[0]!.event} is active in this area. Check UDOT US-189 / SR-92 road conditions and traction rules before driving the canyon.`
      : '';

  return {
    ok: conditions.ok,
    readAt: conditions.readAt,
    sundance: conditions.sundance
      ? {
          days: conditions.sundance.days,
          snow48: conditions.snow?.inches48 ?? null,
        }
      : conditions.snow
        ? { days: [], snow48: conditions.snow.inches48 }
        : null,
    houses: HOUSE_POINTS.map((point) => ({
      id: point.id,
      label: point.label,
      days: conditions.houses.find((row) => row.id === point.id)?.days ?? [],
    })),
    river,
    alerts: conditions.alerts,
    advisory,
    note: 'Live National Weather Service forecast and USGS Provo River gauge 10163000 at Vivian Park. This is not a road-closure feed and does not state whether US-189 or SR-92 is open.',
    sends: false,
  };
}
