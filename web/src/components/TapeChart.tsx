import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency, type Reservation } from '../lib/api';
import { loadDateBlocks } from '../lib/booked-nights';
import { addDays } from '../lib/market/dates';
import { currentDayIso } from '../lib/months';
import { layoutTape, type TapeBar, type TapeChannel, type TapeGap, type TapeRowId } from '../lib/tape-chart';
import { useViewer } from '../lib/platform/viewer';

const CHANNEL: Record<TapeChannel, string> = {
  airbnb: '#c4554a',
  vrbo: '#3d6f9f',
  direct: '#d4b56a',
  other: '#6d8f86',
};

const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

function dayMeta(iso: string): { weekday: string; isWeekend: boolean; monthShort: string; isFirstOfMonth: boolean } {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  const dow = dt.getUTCDay();
  const monthShort = dt.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return {
    weekday: WEEKDAY_SHORT[dow] ?? '',
    isWeekend: dow === 5 || dow === 6, // Fri & Sat nights
    monthShort,
    isFirstOfMonth: d === 1,
  };
}

export function TapeChart({
  reservations,
  days: initialDays = 28,
  start,
  compact = false,
  unreadable = false,
}: {
  reservations: Reservation[];
  days?: number;
  start?: string;
  compact?: boolean;
  unreadable?: boolean;
}) {
  const viewer = useViewer();
  const hideLindon = viewer.known && viewer.houses !== null && !viewer.houses.includes('lindon');
  const todayIso = currentDayIso();

  const [anchor, setAnchor] = useState(() => start ?? todayIso);
  const [horizon, setHorizon] = useState<number>(initialDays);
  const [selectedStayId, setSelectedStayId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Array<{ propertyId: string; start: string; end: string }>>([]);
  const [blocksKnown, setBlocksKnown] = useState(false);

  useEffect(() => {
    if (start) setAnchor(start);
  }, [start]);

  useEffect(() => {
    let cancel = false;
    loadDateBlocks()
      .then((rows) => {
        if (cancel) return;
        setBlocks(rows ?? []);
        setBlocksKnown(rows !== null);
      })
      .catch(() => {
        if (!cancel) setBlocksKnown(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const effectiveStart = compact ? (start ?? todayIso) : anchor;
  const effectiveDays = compact ? initialDays : horizon;

  const layout = useMemo(
    () =>
      unreadable
        ? layoutTape({ reservations: [], start: effectiveStart, days: effectiveDays, hideLindon, blocks: [] })
        : layoutTape({ reservations, start: effectiveStart, days: effectiveDays, hideLindon, blocks }),
    [unreadable, reservations, effectiveStart, effectiveDays, hideLindon, blocks],
  );

  const cellMinPx = compact ? 28 : effectiveDays >= 60 ? 28 : 36;
  const width = Math.max(layout.days.length * cellMinPx + 156, 360);

  const windowStats = useMemo(() => {
    const uniqueStays = new Map<string, TapeChannel>();
    for (const bar of layout.bars) {
      if (bar.kind === 'stay' && bar.reservationId) {
        uniqueStays.set(bar.reservationId, bar.channel);
      }
    }
    let direct = 0;
    let airbnb = 0;
    let vrbo = 0;
    for (const ch of uniqueStays.values()) {
      if (ch === 'direct') direct += 1;
      else if (ch === 'airbnb') airbnb += 1;
      else if (ch === 'vrbo') vrbo += 1;
    }
    return {
      totalStays: uniqueStays.size,
      direct,
      airbnb,
      vrbo,
      turnovers: layout.turnovers.length,
      gaps: layout.gaps.length,
    };
  }, [layout]);

  const selectedStay = useMemo(
    () => (selectedStayId ? reservations.find((r) => r.id === selectedStayId) ?? null : null),
    [selectedStayId, reservations],
  );

  const rangeLabel = useMemo(() => {
    const first = layout.days[0];
    const last = layout.days[layout.days.length - 1];
    if (!first || !last) return '';
    return `${first} → ${last}`;
  }, [layout.days]);

  return (
    <section className="uml-panel rounded-3xl p-4 sm:p-6" data-bot="tape-chart">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="uml-kicker">Tape · {rangeLabel}</p>
          <h2 className="font-display text-3xl mt-1">
            {compact ? 'The next two weeks' : 'Multi-Property & River Wing Tape'}
          </h2>
        </div>

        {!compact && (
          <div className="flex flex-wrap items-center gap-1.5" data-print-hide>
            <button
              type="button"
              onClick={() => setAnchor((cur) => addDays(cur, -Math.max(7, Math.round(effectiveDays / 2))))}
              className="uml-nav inline-flex items-center gap-1 border border-[var(--uml-line)] px-2.5"
              aria-label="Earlier dates"
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Earlier
            </button>
            <button
              type="button"
              data-bot="calendar-today"
              onClick={() => setAnchor(todayIso)}
              className={`uml-nav border ${
                anchor === todayIso ? 'border-[var(--uml-gold)] text-[var(--uml-gold)]' : 'border-[var(--uml-line)]'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setAnchor((cur) => addDays(cur, Math.max(7, Math.round(effectiveDays / 2))))}
              className="uml-nav inline-flex items-center gap-1 border border-[var(--uml-line)] px-2.5"
              aria-label="Later dates"
            >
              Later
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <input
              type="date"
              aria-label="Jump to start date"
              value={anchor}
              onChange={(e) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) setAnchor(e.target.value);
              }}
              className="rounded-full border border-[var(--uml-line)] bg-transparent px-3 py-1.5 text-xs text-[var(--uml-ink)] uml-num"
            />
            <div className="ml-1 flex items-center gap-1" role="group" aria-label="Horizon days">
              {([14, 28, 60, 90] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={horizon === d}
                  data-bot={`tape-horizon-${d}`}
                  onClick={() => setHorizon(d)}
                  className={`rounded-full border px-2.5 py-1.5 text-[11px] uml-num transition-colors ${
                    horizon === d
                      ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold'
                      : 'border-[var(--uml-line)] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]'
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {unreadable ? (
        <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="tape-unreadable">
          Saved bookings could not be read. This chart is empty on purpose. Nothing was invented.
        </p>
      ) : (
        <p className="mt-2 text-sm text-[var(--uml-muted)]">
          Gold is a direct stay, red is Airbnb, blue is VRBO. A shaded wing is blocked by the other way of selling that night.
          {!blocksKnown ? ' Calendar blocks could not be read, so they are not drawn.' : ''}
        </p>
      )}

      {!compact && !unreadable && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs uml-num" data-bot="tape-summary">
          <span className="rounded-full border border-[var(--uml-line)] px-3 py-1">
            <strong>{windowStats.totalStays}</strong> stays in window
          </span>
          <span className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-[#d4b56a]">
            Direct {windowStats.direct}
          </span>
          <span className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-[#e58980]">
            Airbnb {windowStats.airbnb}
          </span>
          <span className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-[#7eb3e6]">
            VRBO {windowStats.vrbo}
          </span>
          <span className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-[var(--uml-muted)]">
            {windowStats.turnovers} same-day turns · {windowStats.gaps} clickable 1–4n gaps
          </span>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <div style={{ minWidth: width }}>
          <div
            className="grid"
            style={{ gridTemplateColumns: `156px repeat(${layout.days.length}, minmax(${cellMinPx}px, 1fr))` }}
          >
            <div className="pr-2 text-[10px] uppercase tracking-widest text-[var(--uml-muted)] self-end pb-1">
              Property / Wing
            </div>
            {layout.days.map((iso, idx) => {
              const meta = dayMeta(iso);
              const isToday = iso === todayIso;
              const showMonth = idx === 0 || meta.isFirstOfMonth;
              return (
                <div
                  key={iso}
                  className={`px-0.5 pb-1 text-center leading-tight ${
                    isToday
                      ? 'text-[var(--uml-gold)] font-bold'
                      : meta.isWeekend
                        ? 'text-[var(--uml-ink)]'
                        : 'text-[var(--uml-muted)]'
                  }`}
                >
                  <span className="block text-[8px] uppercase tracking-wider h-3">
                    {showMonth ? meta.monthShort : ''}
                  </span>
                  <span className="block text-[8px] opacity-75">{meta.weekday}</span>
                  <span className="block text-[10px] uml-num">{iso.slice(8)}</span>
                </div>
              );
            })}
            {layout.rows.map((row) => (
              <Row
                key={row.id}
                row={row.id}
                label={row.label}
                days={layout.days}
                todayIso={todayIso}
                bars={layout.bars}
                cascades={layout.cascades}
                turnovers={layout.turnovers}
                gaps={layout.gaps}
                onSelectStay={compact ? undefined : setSelectedStayId}
              />
            ))}
          </div>
        </div>
      </div>

      {!compact && selectedStay && (
        <div
          className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--uml-gold)]/50 bg-[var(--uml-surface-2)]/65 px-4 py-3 text-xs"
          data-bot="tape-selected-stay"
        >
          <div>
            <p className="font-semibold text-sm text-[var(--uml-ink)]">
              {selectedStay.guestName} · <span className="capitalize">{selectedStay.propertyId}</span>
              {selectedStay.units && selectedStay.units.length > 0 ? ` (${selectedStay.units.join(', ')})` : ''}
            </p>
            <p className="mt-0.5 text-[var(--uml-muted)] uml-num">
              {selectedStay.checkIn} → {selectedStay.checkOut} · {selectedStay.source}
              {selectedStay.payout > 0 ? ` · ${formatCurrency(selectedStay.payout)} host net` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('uml:focus-guest', { detail: { id: selectedStay.id } }));
                if (window.UML) window.UML.navigate('guests');
                else window.location.hash = '#/guests';
              }}
              className="uml-gold-btn inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-[0.12em]"
            >
              Open in Guests <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setSelectedStayId(null)}
              className="uml-nav border border-[var(--uml-line)]"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Row({
  row,
  label,
  days,
  todayIso,
  bars,
  cascades,
  turnovers,
  gaps,
  onSelectStay,
}: {
  row: TapeRowId;
  label: string;
  days: string[];
  todayIso: string;
  bars: TapeBar[];
  cascades: Array<{ row: TapeRowId; day: number }>;
  turnovers: Array<{ row: TapeRowId; day: number }>;
  gaps: TapeGap[];
  onSelectStay?: (id: string) => void;
}) {
  const count = days.length;
  const mine = bars.filter((bar) => bar.row === row);
  return (
    <>
      <div className="flex items-center pr-2 text-xs border-t border-[var(--uml-line)]/45">{label}</div>
      <div className="relative col-span-full h-9 border-t border-[var(--uml-line)]/45" style={{ gridColumn: `2 / span ${count}` }}>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
          {days.map((iso, day) => {
            const shaded = cascades.some((cell) => cell.row === row && cell.day === day);
            const turn = turnovers.some((cell) => cell.row === row && cell.day === day);
            const isToday = iso === todayIso;
            const weekend = dayMeta(iso).isWeekend;
            return (
              <div
                key={iso}
                className="border-l border-[var(--uml-line)]"
                style={{
                  background: shaded
                    ? 'color-mix(in srgb, var(--uml-gold) 28%, transparent)'
                    : isToday
                      ? 'color-mix(in srgb, var(--uml-gold) 10%, transparent)'
                      : weekend
                        ? 'rgba(255, 255, 255, 0.02)'
                        : undefined,
                }}
                data-cascade={shaded ? 'yes' : undefined}
              >
                {turn ? <span className="block h-full w-0.5 bg-[var(--uml-ink)]" title="Same-day turnover" /> : null}
              </div>
            );
          })}
        </div>
        {mine.map((bar) => {
          const clickable = Boolean(onSelectStay && bar.reservationId && bar.kind === 'stay');
          return (
            <div
              key={bar.id}
              title={bar.label}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={
                clickable && bar.reservationId
                  ? () => onSelectStay?.(bar.reservationId!)
                  : undefined
              }
              onKeyDown={
                clickable && bar.reservationId
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectStay?.(bar.reservationId!);
                      }
                    }
                  : undefined
              }
              className={`absolute top-1 flex h-7 items-center overflow-hidden rounded-full px-2 text-[10px] text-[#1a1408] ${
                clickable ? 'cursor-pointer hover:brightness-110 transition' : ''
              }`}
              style={{
                left: `${(bar.start / count) * 100}%`,
                width: `${((bar.end - bar.start) / count) * 100}%`,
                background: bar.kind === 'block' ? '#244843' : CHANNEL[bar.channel],
                outline: bar.kind === 'hold' ? '1px dashed var(--uml-ink)' : undefined,
                color: bar.kind === 'block' ? '#f4f1ea' : '#1a1408',
              }}
            >
              <span className="truncate font-medium">{bar.label}</span>
            </div>
          );
        })}
        {gaps
          .filter((gap) => gap.row === row)
          .map((gap) => (
            <button
              key={`${gap.checkIn}-${gap.nights}`}
              type="button"
              data-bot="tape-gap"
              className="absolute top-1 h-7 rounded-full border border-dashed border-[var(--uml-gold)] bg-transparent px-1 text-[10px] text-[var(--uml-gold)] hover:bg-[var(--uml-gold)]/15 transition-colors"
              style={{ left: `${(gap.start / count) * 100}%`, width: `${(gap.nights / count) * 100}%` }}
              onClick={() => {
                sessionStorage.setItem('uml-gap', JSON.stringify({ house: gap.house, checkIn: gap.checkIn, checkOut: gap.checkOut }));
                window.location.hash = '#/market';
              }}
            >
              {gap.nights}n
            </button>
          ))}
      </div>
    </>
  );
}
