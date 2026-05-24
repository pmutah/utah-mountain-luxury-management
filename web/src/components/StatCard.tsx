import type { ComponentType } from 'react';
import { formatPct } from '../lib/months';

export function StatCard({
  label,
  value,
  icon: Icon,
  color = 'text-white',
  delta,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  color?: string;
  delta?: number | null;
}) {
  return (
    <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between">
      <div className="p-2 bg-slate-800 rounded-xl w-fit mb-4">
        <Icon className="w-5 h-5 text-slate-400" />
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
        <h3 className={`text-2xl font-black mt-1 ${color}`}>{value}</h3>
        {delta !== undefined && (
          <p
            className={`text-[10px] font-bold mt-1 ${
              delta === null ? 'text-slate-600' : delta >= 0 ? 'text-emerald-500' : 'text-red-400'
            }`}
          >
            {delta === null ? 'vs prior month —' : `vs prior month ${formatPct(delta)}`}
          </p>
        )}
      </div>
    </div>
  );
}
