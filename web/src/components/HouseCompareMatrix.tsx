import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { housePageHref } from '../lib/house-page';
import { buildHouseComparisonRows, TRIP_ARCHETYPES, type TripArchetypeId } from '../lib/house-compare';
import type { HouseId } from '../lib/market/types';

const HOUSE_COLUMNS: Array<{ id: HouseId; title: string; subtitle: string }> = [
  { id: 'river', title: 'River House', subtitle: 'Vivian Park · Provo Canyon' },
  { id: 'ranch', title: 'Ranch House', subtitle: 'Center St · Lindon' },
  { id: 'lindon', title: 'Lindon House', subtitle: 'Harcliff Cir · Lindon' },
];

export function HouseCompareMatrix({
  checkIn,
  checkOut,
  guests,
  childrenCount,
}: {
  checkIn: string;
  checkOut: string;
  guests: string;
  childrenCount: string;
}) {
  const [archetype, setArchetype] = useState<TripArchetypeId>('all');
  const rows = useMemo(() => buildHouseComparisonRows(), []);
  const active = TRIP_ARCHETYPES.find((item) => item.id === archetype) ?? TRIP_ARCHETYPES[0]!;

  return (
    <section className="uml-panel mt-10 rounded-3xl p-5 sm:p-7" data-bot="houses-compare">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="uml-kicker">Matchmaker &amp; side-by-side specs</p>
          <h2 className="font-display text-3xl mt-1">Which house fits your trip?</h2>
        </div>
        <p className="text-xs text-[var(--uml-muted)]">
          Every figure matches our published room layouts — no hidden platform markup.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by trip style">
        {TRIP_ARCHETYPES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={archetype === item.id}
            data-bot={`houses-archetype-${item.id}`}
            onClick={() => setArchetype(item.id)}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              archetype === item.id
                ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold'
                : 'border-[var(--uml-line)] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <p className="mt-3 flex items-start gap-2 text-sm text-[var(--uml-muted)]" data-bot="houses-archetype-summary">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[var(--uml-gold)]" aria-hidden="true" />
        <span>{active.summary}</span>
      </p>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--uml-line)]">
        <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-[var(--uml-line)] bg-[var(--uml-surface-2)]/65">
              <th className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-[var(--uml-muted)] w-44">
                Feature
              </th>
              {HOUSE_COLUMNS.map((col) => {
                const highlighted = archetype !== 'all' && active.recommended.includes(col.id);
                return (
                  <th
                    key={col.id}
                    className={`px-4 py-3 transition-opacity ${
                      archetype !== 'all' && !highlighted ? 'opacity-45' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={housePageHref(col.id, checkIn, checkOut, guests, childrenCount)}
                        className="font-display text-xl hover:text-[var(--uml-gold)] transition-colors"
                      >
                        {col.title}
                      </a>
                      {highlighted && (
                        <span className="rounded-full bg-[var(--uml-gold)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--uml-gold-ink)]">
                          Top fit
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] font-normal text-[var(--uml-muted)]">{col.subtitle}</p>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-[var(--uml-line)]/50 last:border-0">
                <td className="px-4 py-3 text-xs font-semibold text-[var(--uml-muted)]">{row.label}</td>
                {HOUSE_COLUMNS.map((col) => {
                  const dimmed = archetype !== 'all' && !active.recommended.includes(col.id);
                  return (
                    <td
                      key={col.id}
                      className={`px-4 py-3 text-xs leading-relaxed transition-opacity ${dimmed ? 'opacity-45' : ''}`}
                    >
                      {row.values[col.id]}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className="bg-[var(--uml-surface-2)]/40">
              <td className="px-4 py-3 text-xs font-semibold text-[var(--uml-muted)]">Explore &amp; quote</td>
              {HOUSE_COLUMNS.map((col) => (
                <td key={col.id} className="px-4 py-3">
                  <a
                    href={housePageHref(col.id, checkIn, checkOut, guests, childrenCount)}
                    data-bot={`houses-compare-open-${col.id}`}
                    className="inline-block text-xs uppercase tracking-[0.14em] text-[var(--uml-gold)] hover:underline"
                  >
                    Open {col.title.split(' ')[0]} →
                  </a>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
