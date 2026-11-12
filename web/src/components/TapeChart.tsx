import { useEffect, useState } from 'react';
import type { Reservation } from '../lib/api';
import { loadDateBlocks } from '../lib/booked-nights';
import { currentDayIso } from '../lib/months';
import { layoutTape, type TapeBar, type TapeChannel, type TapeGap, type TapeRowId } from '../lib/tape-chart';
import { useViewer } from '../lib/platform/viewer';

const CHANNEL: Record<TapeChannel, string> = {
  airbnb: '#c4554a',
  vrbo: '#3d6f9f',
  direct: '#d4b56a',
  other: '#6d8f86',
};

export function TapeChart({
  reservations,
  days = 28,
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
  const [blocks, setBlocks] = useState<Array<{ propertyId: string; start: string; end: string }>>([]);
  const [blocksKnown, setBlocksKnown] = useState(false);
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
  const origin = start ?? currentDayIso();
  const layout = unreadable
    ? layoutTape({ reservations: [], start: origin, days, hideLindon, blocks: [] })
    : layoutTape({ reservations, start: origin, days, hideLindon, blocks });
  const width = Math.max(layout.days.length * (compact ? 28 : 36), 320);

  return (
    <section className="uml-panel rounded-3xl p-4 sm:p-6" data-bot="tape-chart">
      <p className="uml-kicker">Tape</p>
      <h2 className="font-display text-3xl mt-1">{compact ? 'The next two weeks' : 'Houses and River wings'}</h2>
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
      <div className="mt-4 overflow-x-auto">
        <div style={{ minWidth: width }}>
          <div className="grid" style={{ gridTemplateColumns: `148px repeat(${layout.days.length}, minmax(${compact ? 28 : 36}px, 1fr))` }}>
            <div />
            {layout.days.map((iso) => (
              <div key={iso} className="px-0.5 text-center text-[9px] uppercase tracking-wide text-[var(--uml-muted)]">
                {iso.slice(8)}
              </div>
            ))}
            {layout.rows.map((row) => (
              <Row key={row.id} row={row.id} label={row.label} days={layout.days.length} bars={layout.bars} cascades={layout.cascades} turnovers={layout.turnovers} gaps={layout.gaps} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function Row({
  row,
  label,
  days,
  bars,
  cascades,
  turnovers,
  gaps,
}: {
  row: TapeRowId;
  label: string;
  days: number;
  bars: TapeBar[];
  cascades: Array<{ row: TapeRowId; day: number }>;
  turnovers: Array<{ row: TapeRowId; day: number }>;
  gaps: TapeGap[];
}) {
  const mine = bars.filter((bar) => bar.row === row);
  return (
    <>
      <div className="flex items-center pr-2 text-xs">{label}</div>
      <div className="relative col-span-full h-9" style={{ gridColumn: `2 / span ${days}` }}>
        <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
          {Array.from({ length: days }, (_, day) => {
            const shaded = cascades.some((cell) => cell.row === row && cell.day === day);
            const turn = turnovers.some((cell) => cell.row === row && cell.day === day);
            return (
              <div
                key={day}
                className="border-l border-[var(--uml-line)]"
                style={{ background: shaded ? 'color-mix(in srgb, var(--uml-gold) 28%, transparent)' : undefined }}
                data-cascade={shaded ? 'yes' : undefined}
              >
                {turn ? <span className="block h-full w-0.5 bg-[var(--uml-ink)]" title="Same-day turnover" /> : null}
              </div>
            );
          })}
        </div>
        {mine.map((bar) => (
          <div
            key={bar.id}
            title={bar.label}
            className="absolute top-1 flex h-7 items-center overflow-hidden rounded-full px-2 text-[10px] text-[#1a1408]"
            style={{
              left: `${(bar.start / days) * 100}%`,
              width: `${((bar.end - bar.start) / days) * 100}%`,
              background: bar.kind === 'block' ? '#244843' : CHANNEL[bar.channel],
              outline: bar.kind === 'hold' ? '1px dashed var(--uml-ink)' : undefined,
              color: bar.kind === 'block' ? '#f4f1ea' : '#1a1408',
            }}
          >
            <span className="truncate">{bar.label}</span>
          </div>
        ))}
        {gaps
          .filter((gap) => gap.row === row)
          .map((gap) => (
            <button
              key={`${gap.checkIn}-${gap.nights}`}
              type="button"
              data-bot="tape-gap"
              className="absolute top-1 h-7 rounded-full border border-dashed border-[var(--uml-gold)] bg-transparent px-1 text-[10px] text-[var(--uml-gold)]"
              style={{ left: `${(gap.start / days) * 100}%`, width: `${(gap.nights / days) * 100}%` }}
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
