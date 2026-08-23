import { formatCurrency, type OwnerDistribution as Dist } from '../lib/api';

export function OwnerDistributionPanel({ dist }: { dist: Dist }) {
  const leftover = dist.todd * 2;
  const lossAfterFee = leftover < 0;
  const barTotal = Math.max(dist.brandon, 0) + Math.max(dist.todd, 0);
  const pct = (v: number) => (barTotal > 0 && v > 0 ? (v / barTotal) * 100 : 0);

  const rows = [
    { name: 'Brandon & Stephanie', role: 'Owners & PM', val: dist.brandon, color: 'text-blue-400', bg: 'bg-blue-600' },
    { name: 'Todd Wilhite', role: 'Equity Partner', val: dist.todd, color: 'text-white', bg: 'bg-slate-700' },
    { name: 'Management fee (20%)', role: 'Included in Brandon & Stephanie', val: dist.mgtFee, color: 'text-amber-400', bg: 'bg-amber-600' },
  ];

  return (
    <div className="space-y-4">
      {lossAfterFee && (
        <p className="text-xs font-bold text-red-400">
          Loss after the 20% fee: {formatCurrency(leftover)} split 50/50. Each partner’s share is a
          negative on the books.
        </p>
      )}
      {!lossAfterFee && barTotal > 0 && (
        <div className="h-3 rounded-full overflow-hidden flex bg-slate-800">
          <div className="bg-blue-600" style={{ width: `${pct(dist.brandon)}%` }} title="Brandon" />
          <div className="bg-slate-600" style={{ width: `${pct(dist.todd)}%` }} title="Todd" />
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {rows.map((o) => (
          <div
            key={o.name}
            className="bg-slate-900 p-6 rounded-[32px] border border-slate-800 flex flex-col gap-3 shadow-lg"
          >
            <div className="flex items-center gap-4">
              <div className={`w-10 h-10 rounded-xl ${o.bg} flex items-center justify-center text-white font-black shrink-0`}>
                {o.name[0]}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-white truncate">{o.name}</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase">{o.role}</p>
              </div>
            </div>
            <p className={`text-xl font-black ${o.val < 0 ? 'text-red-400' : o.color}`}>{formatCurrency(o.val)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
