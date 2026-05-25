import { useCallback, useEffect, useState } from 'react';
import { api, PROPERTIES, type HistoryData, type PortfolioData } from './lib/api';
import { LoginGate } from './components/LoginGate';
import { Header } from './components/Header';
import { PortfolioOverview } from './components/PortfolioOverview';
import { PropertyDetail } from './components/PropertyDetail';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { ToastStack } from './components/Toast';
import { useToast } from './hooks/useToast';

type TabId = 'portfolio' | 'ranch' | 'lindon';

function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('portfolio');
  const [currentMonth, setCurrentMonth] = useState('2026-07');
  const [data, setData] = useState<PortfolioData | null>(null);
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [extraCleaningFees, setExtraCleaningFees] = useState<Record<string, number>>({});
  const { toasts, show: showToast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [portfolio, hist] = await Promise.all([
        api.getPortfolio(currentMonth),
        api.getHistory(currentMonth, 12),
      ]);
      setData(portfolio);
      setHistory(hist);
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

  if (error && !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-red-400 font-bold">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="px-6 py-3 bg-blue-600 rounded-2xl text-sm font-black uppercase"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 pb-24">
      <div className="max-w-4xl mx-auto">
        <Header month={currentMonth} onMonthChange={setCurrentMonth} />

        <nav className="flex gap-2 overflow-x-auto pb-4 mb-8 scrollbar-thin">
          {(['portfolio', 'ranch', 'lindon'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-6 sm:px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap min-h-[44px] ${
                activeTab === id
                  ? 'bg-blue-600 text-white shadow-xl'
                  : 'bg-slate-900 text-slate-500 border border-slate-800'
              }`}
            >
              {id === 'portfolio' ? 'Overview' : PROPERTIES[id].name}
            </button>
          ))}
        </nav>

        {loading && !data ? (
          <LoadingSkeleton />
        ) : data ? (
          <main className={loading ? 'opacity-60 pointer-events-none' : ''}>
            {activeTab === 'portfolio' && (
              <PortfolioOverview
                data={data}
                history={history}
                onToast={showToast}
                onRefresh={() => void load()}
                onError={(msg) => showToast(msg, 'error')}
              />
            )}
            {(activeTab === 'ranch' || activeTab === 'lindon') && (
              <PropertyDetail
                tab={activeTab}
                data={data}
                extraCleaningFees={extraCleaningFees}
                onRefresh={() => void load()}
                onToast={showToast}
                onError={(msg) => showToast(msg, 'error')}
              />
            )}
          </main>
        ) : null}
      </div>
      <ToastStack toasts={toasts} />
    </div>
  );
}

export default function App() {
  return (
    <LoginGate>
      <Dashboard />
    </LoginGate>
  );
}
