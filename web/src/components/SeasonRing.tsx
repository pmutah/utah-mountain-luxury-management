import { useMemo, useState } from 'react';
import type { Reservation } from '../lib/api';
import { daysInYear, nightsInYear } from '../lib/luxury';

const COLORS: Record<string, string> = {
  ranch: '#d4b56a',
  lindon: '#e7d7b1',
  river: '#7ec8c2',
};

export function SeasonRing({
  year,
  reservations,
  propertyId,
  title = 'The year',
}: {
  year: number;
  reservations: Reservation[];
  propertyId?: string;
  title?: string;
}) {
  const [ghost, setGhost] = useState(false);
  const days = daysInYear(year);
  const current = useMemo(
    () => nightsInYear(year, reservations, propertyId),
    [year, reservations, propertyId],
  );
  const prior = useMemo(
    () => nightsInYear(year - 1, reservations, propertyId),
    [year, reservations, propertyId],
  );
  const max = Math.max(1, ...[...current.values()].map((n) => n.payout));
  const booked = current.size;
  const cx = 160;
  const cy = 160;

  const ticks = (marks: Map<number, { payout: number; propertyId: string }>, ghostYear: boolean) => {
    const lines = [];
    const count = ghostYear ? daysInYear(year - 1) : days;
    for (let i = 0; i < count; i++) {
      const mark = marks.get(i);
      const angle = -Math.PI / 2 + (i / count) * Math.PI * 2;
      const inner = ghostYear ? 92 : 100;
      const thickness = mark ? 8 + (mark.payout / max) * 28 : 2;
      const outer = inner + (ghostYear ? Math.min(thickness, 14) : thickness);
      const x1 = cx + Math.cos(angle) * inner;
      const y1 = cy + Math.sin(angle) * inner;
      const x2 = cx + Math.cos(angle) * outer;
      const y2 = cy + Math.sin(angle) * outer;
      lines.push(
        <line
          key={`${ghostYear ? 'g' : 'n'}-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={mark ? COLORS[mark.propertyId] ?? '#d4b56a' : 'rgba(143,163,156,0.25)'}
          strokeWidth={ghostYear ? 1.2 : 1.6}
          opacity={ghostYear ? 0.45 : 1}
        />,
      );
    }
    return lines;
  };

  return (
    <section className="uml-panel rounded-3xl p-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <p className="uml-kicker">{title}</p>
          <h2 className="font-display text-3xl">{year}</h2>
        </div>
        <button type="button" className="uml-nav" aria-pressed={ghost} onClick={() => setGhost((v) => !v)}>
          {ghost ? 'Hide last year' : 'Lay last year under'}
        </button>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
        <svg viewBox="0 0 320 320" className="w-full max-w-[320px]" role="img" aria-label={`${booked} nights booked in ${year}`}>
          {ghost && ticks(prior, true)}
          {ticks(current, false)}
          <text x={cx} y={cy - 6} textAnchor="middle" fill="var(--uml-ink)" fontSize="28" fontFamily="Cormorant Garamond, serif">
            {booked}
          </text>
          <text x={cx} y={cy + 16} textAnchor="middle" fill="var(--uml-muted)" fontSize="11">
            nights booked
          </text>
        </svg>
        <div className="text-sm text-[var(--uml-muted)] space-y-2">
          <p>Each spoke is a night. Booked nights grow with the nightly payout, so ski weeks and peak weekends read thicker.</p>
          <p><span className="text-[#d4b56a]">Ranch</span> · <span className="text-[#e7d7b1]">Lindon</span> · <span className="text-[#7ec8c2]">River</span></p>
          <p>The month calendar stays one click away on each house.</p>
        </div>
      </div>
    </section>
  );
}
