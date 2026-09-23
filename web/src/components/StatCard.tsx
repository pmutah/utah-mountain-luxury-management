import type { ComponentType } from 'react';
import { formatPct } from '../lib/months';

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 128;
  const h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} className="mt-3" aria-hidden="true">
      <polyline fill="none" stroke="var(--uml-gold)" strokeWidth="1.25" points={pts} />
    </svg>
  );
}

export function StatCard({
  label,
  value,
  icon: Icon,
  delta,
  series,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  color?: string;
  delta?: number | null;
  series?: number[];
}) {
  return (
    <div className="uml-panel p-5 rounded-3xl flex flex-col justify-between min-h-[148px]">
      <div className="flex items-center justify-between">
        <p className="uml-kicker">{label}</p>
        <Icon className="w-4 h-4 text-[var(--uml-gold)]" />
      </div>
      <div>
        <h3 className="font-display uml-num text-4xl mt-3 text-[var(--uml-ink)]">{value}</h3>
        {delta !== undefined && (
          <p className="text-[11px] mt-1 text-[var(--uml-muted)]">
            {delta === null ? 'vs prior month \u2014' : `vs prior month ${formatPct(delta)}`}
          </p>
        )}
        {series && <Spark values={series} />}
      </div>
    </div>
  );
}
