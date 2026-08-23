import { useCallback, useEffect, useState } from 'react';
import { api, PROPERTIES, type HistoryData, type PortfolioData } from './lib/api';
import { LoginGate } from './components/LoginGate';
import { Header } from './components/Header';
import { PortfolioOverview } from './components/PortfolioOverview';
import { PortfolioReport } from './components/PortfolioReport';
import { DocumentsVault } from './components/DocumentsVault';
import { EsignCeremony } from './components/EsignCeremony';
import { PropertyDetail } from './components/PropertyDetail';
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { ToastStack } from './components/Toast';
import { AgentChat } from './components/AgentChat';
import { ConstructionManagerChat } from './components/ConstructionManagerChat';
import { ConstructionProjectView } from './components/ConstructionProject';
import { GuestsPanel } from './components/GuestsPanel';
import { GuestPreferenceForm } from './components/GuestPreferenceForm';
import { useToast } from './hooks/useToast';
import { currentYearMonth } from './lib/months';

type TabId = 'portfolio' | 'report' | 'guests' | 'ranch' | 'lindon' | 'river' | 'construction';
type ReportView = 'pnl' | 'documents';

function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('portfolio');
  const [reportView, setReportView] = useState<ReportView>('pnl');
  const [currentMonth, setCurrentMonth] = useState(currentYearMonth);
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
      const [, portfolio, hist] = await Promise.all([
        api.syncCalendar().catch(() => null),
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
          {(['portfolio', 'report', 'guests', 'ranch', 'lindon', 'river', 'construction'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-6 sm:px-8 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap min-h-[44px] ${
                activeTab === id
                  ? id === 'construction'
                    ? 'bg-amber-600 text-white shadow-xl'
                    : id === 'river'
                      ? 'bg-cyan-600 text-white shadow-xl'
                      : id === 'report'
                        ? 'bg-violet-600 text-white shadow-xl'
                        : id === 'guests'
                          ? 'bg-teal-600 text-white shadow-xl'
                          : 'bg-blue-600 text-white shadow-xl'
                  : 'bg-slate-900 text-slate-500 border border-slate-800'
              }`}
            >
              {id === 'portfolio'
                ? 'Overview'
                : id === 'report'
                  ? 'Report'
                  : id === 'guests'
                    ? 'Guests'
                    : id === 'construction'
                      ? PROPERTIES.construction.name
                      : PROPERTIES[id].name}
            </button>
          ))}
        </nav>

        {activeTab === 'construction' ? (
          <main>
            <ConstructionProjectView
              onToast={showToast}
              onError={(msg) => showToast(msg, 'error')}
            />
          </main>
        ) : activeTab === 'report' && reportView === 'documents' ? (
          <main className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setReportView('pnl')}
                className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] bg-slate-900 text-slate-500 border border-slate-800"
              >
                Management
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] bg-violet-600 text-white shadow-xl"
              >
                Documents
              </button>
            </div>
            <DocumentsVault onToast={showToast} />
          </main>
        ) : loading && !data ? (
          <LoadingSkeleton />
        ) : data ? (
          <main className={loading ? 'opacity-60 pointer-events-none' : ''}>
            {activeTab === 'guests' && <GuestsPanel onToast={showToast} />}
            {activeTab === 'portfolio' && (
              <PortfolioOverview
                data={data}
                history={history}
                onToast={showToast}
                onRefresh={() => void load()}
                onError={(msg) => showToast(msg, 'error')}
              />
            )}
            {activeTab === 'report' && (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] bg-violet-600 text-white shadow-xl"
                  >
                    Management
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportView('documents')}
                    className="px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest min-h-[44px] bg-slate-900 text-slate-500 border border-slate-800"
                  >
                    Documents
                  </button>
                </div>
                <PortfolioReport
                  month={currentMonth}
                  reservations={data.reservations}
                  expenses={data.expenses}
                  extraCleaningFees={extraCleaningFees}
                  onToast={showToast}
                />
              </div>
            )}
            {(activeTab === 'ranch' || activeTab === 'lindon' || activeTab === 'river') && (
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
      <AgentChat
        month={currentMonth}
        activeTab={activeTab === 'construction' || activeTab === 'guests' ? 'portfolio' : activeTab}
        onError={(msg) => showToast(msg, 'error')}
      />
      <ConstructionManagerChat
        onError={(msg) => showToast(msg, 'error')}
        onToast={showToast}
      />
    </div>
  );
}

export default function App() {
  const stayMatch = window.location.pathname.match(/^\/stay\/([^/]+)/);
  if (stayMatch?.[1]) {
    return <GuestPreferenceForm token={stayMatch[1]} />;
  }
  const esignMatch = window.location.pathname.match(/^\/esign\/([^/]+)/);
  if (esignMatch?.[1]) {
    return <EsignCeremony token={esignMatch[1]} />;
  }
  return (
    <LoginGate>
      <Dashboard />
    </LoginGate>
  );
}
