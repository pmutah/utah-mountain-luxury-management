import { useMemo, useState } from 'react';
import { RotateCcw, Sliders } from 'lucide-react';
import { formatCurrency } from '../lib/api';
import { MANAGEMENT_FEE_LABEL } from '../lib/owner-fee';
import type { PortfolioReportModel } from '../lib/report';
import { simulatePortfolioWhatIf } from '../lib/report-whatif';

function signedDelta(amount: number): string {
  if (Math.abs(amount) < 0.5) return '±$0';
  return `${amount > 0 ? '+' : ''}${formatCurrency(amount)}`;
}

export function ReportWhatIfSimulator({ report }: { report: PortfolioReportModel }) {
  const [adrDeltaPct, setAdrDeltaPct] = useState(0);
  const [occupancyDeltaPts, setOccupancyDeltaPts] = useState(0);
  const [directShiftPct, setDirectShiftPct] = useState(0);

  const sim = useMemo(
    () =>
      simulatePortfolioWhatIf(report.properties, {
        adrDeltaPct,
        occupancyDeltaPts,
        directShiftPct,
      }),
    [report.properties, adrDeltaPct, occupancyDeltaPts, directShiftPct],
  );

  const isModified = adrDeltaPct !== 0 || occupancyDeltaPts !== 0 || directShiftPct !== 0;

  return (
    <section
      className="bg-slate-900 p-6 sm:p-8 rounded-[40px] border border-slate-800 shadow-xl"
      data-bot="report-whatif"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#d4b56a]" />
            FP&amp;A Yield, Occupancy &amp; Direct-Booking Simulator
          </h3>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Stress-test ADR moves, occupancy gains (including extra turnover cleans), and shifting OTA volume to direct bookings across this period — with automatic {MANAGEMENT_FEE_LABEL} management fee and 50/50 partner waterfall math. Read-only scenario; changes nothing on the books.
          </p>
        </div>

        {isModified && (
          <button
            type="button"
            data-bot="report-whatif-reset"
            onClick={() => {
              setAdrDeltaPct(0);
              setOccupancyDeltaPts(0);
              setDirectShiftPct(0);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-300 bg-slate-950 border border-slate-700"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to actuals
          </button>
        )}
      </div>

      {/* Sliders */}
      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        <label className="block bg-slate-950/60 p-4 rounded-3xl border border-slate-800">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-slate-400 uppercase tracking-widest text-[10px]">Nightly ADR Shift</span>
            <span className="text-white tabular-nums">{adrDeltaPct > 0 ? `+${adrDeltaPct}%` : `${adrDeltaPct}%`}</span>
          </div>
          <input
            type="range"
            min={-20}
            max={30}
            step={1}
            value={adrDeltaPct}
            data-bot="report-whatif-adr"
            onChange={(e) => setAdrDeltaPct(Number(e.target.value))}
            className="mt-3 w-full accent-[#d4b56a]"
          />
          <p className="mt-1 text-[10px] text-slate-500">Models pricing lift or compression across nights</p>
        </label>

        <label className="block bg-slate-950/60 p-4 rounded-3xl border border-slate-800">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-slate-400 uppercase tracking-widest text-[10px]">Occupancy Delta</span>
            <span className="text-white tabular-nums">
              {occupancyDeltaPts > 0 ? `+${occupancyDeltaPts} pts` : `${occupancyDeltaPts} pts`}
            </span>
          </div>
          <input
            type="range"
            min={-15}
            max={25}
            step={1}
            value={occupancyDeltaPts}
            data-bot="report-whatif-occ"
            onChange={(e) => setOccupancyDeltaPts(Number(e.target.value))}
            className="mt-3 w-full accent-[#d4b56a]"
          />
          <p className="mt-1 text-[10px] text-slate-500">Adds/removes nights &amp; proportional turn cleans</p>
        </label>

        <label className="block bg-slate-950/60 p-4 rounded-3xl border border-slate-800">
          <div className="flex justify-between text-xs font-bold">
            <span className="text-slate-400 uppercase tracking-widest text-[10px]">OTA → Direct Shift</span>
            <span className="text-white tabular-nums">+{directShiftPct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={5}
            value={directShiftPct}
            data-bot="report-whatif-direct"
            onChange={(e) => setDirectShiftPct(Number(e.target.value))}
            className="mt-3 w-full accent-[#d4b56a]"
          />
          <p className="mt-1 text-[10px] text-slate-500">Recaptures host channel fees on `/houses/`</p>
        </label>
      </div>

      {/* Projected Output Cards */}
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-950/60 p-4 rounded-3xl border border-slate-800">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Projected Revenue</p>
          <p className="text-xl font-black text-white mt-1 tabular-nums" data-bot="report-whatif-rev">
            {formatCurrency(sim.projectedRevenue)}
          </p>
          <p className={`text-[11px] font-bold mt-1 tabular-nums ${sim.revenueDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {signedDelta(sim.revenueDelta)} vs actual
          </p>
        </div>

        <div className="bg-slate-950/60 p-4 rounded-3xl border border-slate-800">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Projected Net Profit</p>
          <p className="text-xl font-black text-emerald-400 mt-1 tabular-nums" data-bot="report-whatif-profit">
            {formatCurrency(sim.projectedProfit)}
          </p>
          <p className={`text-[11px] font-bold mt-1 tabular-nums ${sim.profitDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {signedDelta(sim.profitDelta)} vs actual
          </p>
        </div>

        {report.ownerFilter !== 'todd' && (
          <div className="bg-slate-950/60 p-4 rounded-3xl border border-slate-800">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Brandon &amp; Steph</p>
            <p className="text-xl font-black text-blue-400 mt-1 tabular-nums">
              {formatCurrency(sim.projectedBrandon)}
            </p>
            <p className="text-[11px] font-bold text-slate-400 mt-1 tabular-nums">
              {signedDelta(sim.projectedBrandon - sim.baseBrandon)} ({formatCurrency(sim.projectedMgmtFee)} fee)
            </p>
          </div>
        )}

        <div className="bg-slate-950/60 p-4 rounded-3xl border border-slate-800">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Todd (Ranch/River 50%)</p>
          <p className="text-xl font-black text-white mt-1 tabular-nums">
            {formatCurrency(sim.projectedTodd)}
          </p>
          <p className="text-[11px] font-bold text-slate-400 mt-1 tabular-nums">
            {signedDelta(sim.projectedTodd - sim.baseTodd)} vs actual
          </p>
        </div>
      </div>
    </section>
  );
}
