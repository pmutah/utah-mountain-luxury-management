import { useCallback, useEffect, useState, type ComponentType } from 'react';
import {
  Moon, DollarSign, BarChart3, Users, Brush, Plus, Hammer,
} from 'lucide-react';
import {
  api, formatCurrency, PROPERTIES, RANCH_MORTGAGE, LINDON_MORTGAGE,
  type PortfolioData,
} from './lib/api';

type TabId = 'portfolio' | 'ranch' | 'lindon';

function StatCard({
  label,
  value,
  icon: Icon,
  color = 'text-white',
}: {
  label: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <div className="bg-slate-900 p-5 rounded-3xl border border-slate-800 shadow-xl flex flex-col justify-between">
      <div className="p-2 bg-slate-800 rounded-xl w-fit mb-4">
        <Icon className="w-5 h-5 text-slate-400" />
      </div>
      <div>
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{label}</p>
        <h3 className={`text-2xl font-black mt-1 ${color}`}>{value}</h3>
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('portfolio');
  const [currentMonth, setCurrentMonth] = useState('2026-07');
  const [data, setData] = useState<PortfolioData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extraCleaningFees, setExtraCleaningFees] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const portfolio = await api.getPortfolio(currentMonth);
      setData(portfolio);
      setExtraCleaningFees(portfolio.extraCleaningFees);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveExtraCleaning = async (key: string, value: string) => {
    const parsed = value === '' ? 0 : Number(value);
    const next: Record<string, number> = { ...extraCleaningFees };
    if (!value || !Number.isFinite(parsed) || parsed <= 0) {
      delete next[key];
    } else {
      next[key] = parsed;
    }
    setExtraCleaningFees(next);
    try {
      const saved = await api.updateExtraCleaning({ [key]: value });
      setExtraCleaningFees(saved);
      await load();
    } catch {
      await load();
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center">
        <p className="text-sm font-bold uppercase tracking-widest text-slate-500">Loading portfolio…</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-red-400 font-bold">{error}</p>
        <button onClick={() => void load()} className="px-6 py-3 bg-blue-600 rounded-2xl text-sm font-black uppercase">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { ranch, lindon, reservations, expenses } = data;
  const activeMetrics = activeTab === 'ranch' ? ranch : activeTab === 'lindon' ? lindon : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 pb-24">
      <div className="max-w-4xl mx-auto">
        <header className="flex flex-col sm:flex-row justify-between items-center gap-6 mb-10">
          <div className="flex items-center gap-4">
            <div className="bg-blue-600 p-3 rounded-2xl shadow-lg shadow-blue-900/20">
              <Moon className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white">Portfolio</h1>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">Wilhite Property Management</p>
            </div>
          </div>
          <input
            type="month"
            value={currentMonth}
            onChange={(e) => setCurrentMonth(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-white px-6 py-3 rounded-2xl font-black focus:ring-2 focus:ring-blue-600 outline-none w-full sm:w-auto cursor-pointer"
          />
        </header>

        <nav className="flex gap-2 overflow-x-auto pb-4 mb-8">
          {(['portfolio', 'ranch', 'lindon'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap ${
                activeTab === id
                  ? 'bg-blue-600 text-white shadow-xl'
                  : 'bg-slate-900 text-slate-500 border border-slate-800'
              }`}
            >
              {id === 'portfolio' ? 'Overview' : PROPERTIES[id].name}
            </button>
          ))}
        </nav>

        <main>
          {activeTab === 'portfolio' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Total Revenue" value={formatCurrency(ranch.revenue + lindon.revenue)} icon={BarChart3} />
                <StatCard label="Net Profit" value={formatCurrency(ranch.profit + lindon.profit)} icon={DollarSign} color="text-blue-400" />
                <StatCard label="Avg Occupancy" value={`${((ranch.occupancy + lindon.occupancy) / 2).toFixed(0)}%`} icon={Users} />
              </div>
              <div className="bg-slate-900 p-8 rounded-[40px] border border-slate-800 text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-10">Revenue Contribution</p>
                <div className="flex justify-center items-center gap-12">
                  <div className="text-center">
                    <p className="text-3xl font-black text-blue-500">{formatCurrency(ranch.revenue)}</p>
                    <p className="text-[10px] font-bold uppercase mt-2 text-slate-500">Ranch House</p>
                  </div>
                  <div className="h-12 w-px bg-slate-800" />
                  <div className="text-center">
                    <p className="text-3xl font-black text-emerald-500">{formatCurrency(lindon.revenue)}</p>
                    <p className="text-[10px] font-bold uppercase mt-2 text-slate-500">Lindon House</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'ranch' || activeTab === 'lindon') && activeMetrics && (
            <div className="space-y-8">
              <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-black text-white">{PROPERTIES[activeTab].name}</h2>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{PROPERTIES[activeTab].address}</p>
                  <p className={`text-xl font-black ${activeTab === 'ranch' ? 'text-blue-400' : 'text-emerald-400'}`}>
                    Profit: {formatCurrency(activeMetrics.profit)}
                  </p>
                </div>
              </div>

              {activeTab === 'ranch' && ranch.dist && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[
                    { name: 'Brandon Pierce', role: 'Owner & PM', val: ranch.dist.brandon, color: 'text-blue-400', bg: 'bg-blue-600' },
                    { name: 'Todd Wilhite', role: 'Equity Partner', val: ranch.dist.todd, color: 'text-white', bg: 'bg-slate-700' },
                  ].map((o) => (
                    <div key={o.name} className="bg-slate-900 p-6 rounded-[32px] border border-slate-800 flex justify-between items-center shadow-lg">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl ${o.bg} flex items-center justify-center text-white font-black`}>{o.name[0]}</div>
                        <div>
                          <p className="text-xs font-black text-white">{o.name}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">{o.role}</p>
                        </div>
                      </div>
                      <p className={`text-xl font-black ${o.color}`}>{formatCurrency(o.val)}</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden shadow-xl">
                <div className="p-6 border-b border-slate-800 flex items-center gap-3">
                  <Brush className="text-slate-500 w-5 h-5" />
                  <h4 className="text-sm font-black uppercase tracking-widest">Financial Breakdown</h4>
                </div>
                <div className="p-8 space-y-6">
                  <div className="grid grid-cols-2 gap-4 pb-6 border-b border-slate-800/50">
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Monthly Mortgage</p>
                      <p className="text-lg font-black text-white">
                        {formatCurrency(activeTab === 'ranch' ? RANCH_MORTGAGE : LINDON_MORTGAGE)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-500 uppercase">Cleaning Fees</p>
                      <p className="text-lg font-black text-red-500">{formatCurrency(activeMetrics.totalCleaning)}</p>
                    </div>
                  </div>

                  <div className="p-6 bg-slate-950/50 rounded-[24px] border border-slate-800/50 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Plus className="w-4 h-4 text-blue-500" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Add Extra Cleaning Fees</p>
                      </div>
                      <div className="flex items-center bg-slate-900 rounded-xl px-4 py-2 border border-slate-700">
                        <span className="text-slate-500 mr-2 font-bold">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={extraCleaningFees[`${activeTab}-${currentMonth}`] ?? ''}
                          onChange={(e) => void saveExtraCleaning(`${activeTab}-${currentMonth}`, e.target.value)}
                          placeholder="0"
                          className="bg-transparent border-none text-sm font-black text-white w-20 p-0 focus:ring-0 outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-600 font-bold italic">
                      Base fee of {formatCurrency(PROPERTIES[activeTab].cleaningFee)}/stay is already included.
                    </p>
                  </div>

                  {expenses.filter((e) => e.propertyId === activeTab && e.month === currentMonth && e.category !== 'Mortgage').length > 0 && (
                    <div className="pt-4 border-t border-slate-800/50">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-3">Other Operational Expenses</p>
                      {expenses
                        .filter((e) => e.propertyId === activeTab && e.month === currentMonth && e.category !== 'Mortgage')
                        .map((e) => (
                          <div key={e.id} className="flex justify-between items-center text-sm mb-2">
                            <span className="text-slate-400 flex items-center gap-2">
                              <Hammer className="w-3 h-3" /> {e.category}
                            </span>
                            <span className="font-black text-white">{formatCurrency(e.amount)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden">
                <div className="p-6 border-b border-slate-800 flex justify-between items-center px-8">
                  <h4 className="text-sm font-black uppercase tracking-widest">Revenue Log</h4>
                  <p className="text-xl font-black text-white">{formatCurrency(activeMetrics.revenue)}</p>
                </div>
                <div className="p-4 space-y-2">
                  {reservations
                    .filter((r) => r.propertyId === activeTab && r.checkIn.startsWith(currentMonth))
                    .map((res) => (
                      <div key={res.id} className="flex justify-between items-center p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50">
                        <div className="min-w-0">
                          <p className="font-black text-sm text-white truncate">{res.guestName}</p>
                          <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">
                            {res.checkIn.slice(5)} to {res.checkOut.slice(5)} • {res.source}
                          </p>
                        </div>
                        <p className="font-black text-sm text-slate-300">{formatCurrency(res.payout)}</p>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
