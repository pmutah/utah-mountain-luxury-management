import { useCallback, useEffect, useState } from 'react';
import { api, type HistoryData, type PortfolioData } from './lib/api';
import {
  parseDashboardHash,
  type DashboardTab,
  type ReportView,
  type RiverView,
} from './lib/bot-nav';
import { installUmlBridge, syncDocumentView } from './lib/uml-bridge';
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
import { OurExpenses } from './components/OurExpenses';
import { GuestsPanel } from './components/GuestsPanel';
import { GuestPreferenceForm } from './components/GuestPreferenceForm';
import { CommandPalette } from './components/CommandPalette';
import { OwnerLetterButton } from './components/OwnerLetterButton';
import { useToast } from './hooks/useToast';
import { currentYearMonth } from './lib/months';

function Dashboard() {
  const initial = parseDashboardHash(window.location.hash);
  const [activeTab, setActiveTab] = useState<DashboardTab>(
    initial.tab === 'construction' ? 'river' : initial.tab,
  );
  const [reportView, setReportView] = useState<ReportView>(initial.reportView);
  const [riverView, setRiverView] = useState<RiverView>(initial.riverView);
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

  const go = useCallback(
    (tab: DashboardTab, view: ReportView = 'pnl', nextRiver: RiverView = 'rental') => {
      if (tab === 'construction') {
        setActiveTab('river');
        setReportView('pnl');
        setRiverView('build');
        return;
      }
      setActiveTab(tab);
      setReportView(tab === 'report' ? view : 'pnl');
      setRiverView(tab === 'river' ? nextRiver : 'rental');
    },
    [],
  );

  useEffect(() => {
    const onHash = () => {
      const next = parseDashboardHash(window.location.hash);
      setActiveTab(next.tab === 'construction' ? 'river' : next.tab);
      setReportView(next.reportView);
      setRiverView(next.riverView);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    syncDocumentView({ tab: activeTab, reportView, riverView }, currentMonth);
  }, [activeTab, reportView, riverView, currentMonth]);

  useEffect(() => {
    installUmlBridge({
      getState: () => ({ tab: activeTab, reportView, riverView, month: currentMonth }),
      navigate: (loc) => go(loc.tab, loc.reportView, loc.riverView),
      setMonth: setCurrentMonth,
    });
  }, [activeTab, reportView, riverView, currentMonth, go]);

  if (error && !data) {
    return (
      <div className="min-h-screen bg-[var(--uml-bg)] text-[var(--uml-ink)] flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="uml-gold-btn px-6 py-3 rounded-full text-sm tracking-widest uppercase"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div id="uml-app" className="min-h-screen font-sans p-4 pb-24">
      <div className="max-w-6xl mx-auto">
        <Header month={currentMonth} onMonthChange={setCurrentMonth} />

        <nav aria-label="Dashboard screens" className="flex flex-wrap gap-2 pb-2 mb-6">
          {(['portfolio', 'report', 'guests', 'ranch', 'lindon', 'river', 'ours'] as const).map((id) => (
            <button
              key={id}
              type="button"
              data-bot={`nav-${id}`}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => go(id, id === 'report' ? reportView : 'pnl')}
              className="uml-nav"
            >
              {id === 'portfolio'
                ? 'Overview'
                : id === 'report'
                  ? 'Report'
                  : id === 'guests'
                    ? 'Guests'
                    : id === 'ours'
                      ? 'Our expenses'
                      : id === 'ranch'
                        ? 'Ranch'
                        : id === 'lindon'
                          ? 'Lindon'
                          : 'River'}
            </button>
          ))}
        </nav>

        {activeTab === 'river' && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              type="button"
              data-bot="river-rental"
              aria-current={riverView === 'rental' ? 'page' : undefined}
              onClick={() => go('river', 'pnl', 'rental')}
              className="uml-nav"
            >
              Rental
            </button>
            <button
              type="button"
              data-bot="nav-construction"
              aria-current={riverView === 'build' ? 'page' : undefined}
              onClick={() => go('river', 'pnl', 'build')}
              className="uml-nav"
            >
              Build costs
            </button>
          </div>
        )}

        {activeTab === 'ours' ? (
          <main>
            <OurExpenses
              onToast={showToast}
              onError={(msg) => showToast(msg, 'error')}
            />
          </main>
        ) : activeTab === 'river' && riverView === 'build' ? (
          <main>
            <ConstructionProjectView
              onToast={showToast}
              onError={(msg) => showToast(msg, 'error')}
            />
          </main>
        ) : activeTab === 'report' && reportView === 'documents' ? (
          <main className="space-y-6">
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" data-bot="report-pnl" onClick={() => go('report', 'pnl')} className="uml-nav">
                Management
              </button>
              <button type="button" data-bot="report-documents" className="uml-nav" aria-current="page">
                Documents
              </button>
              {data && <OwnerLetterButton data={data} onToast={showToast} />}
            </div>
            <DocumentsVault onToast={showToast} />
          </main>
        ) : loading && !data ? (
          <LoadingSkeleton />
        ) : data ? (
          <main className={loading ? 'opacity-60' : ''}>
            {activeTab === 'guests' && <GuestsPanel onToast={showToast} />}
            {activeTab === 'portfolio' && (
              <PortfolioOverview
                data={data}
                history={history}
                onToast={showToast}
                onRefresh={() => void load()}
                onError={(msg) => showToast(msg, 'error')}
                onOpenHouse={(id) => go(id)}
                onOpenBuild={() => go('river', 'pnl', 'build')}
              />
            )}
            {activeTab === 'report' && (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2 items-center">
                  <button type="button" data-bot="report-pnl" className="uml-nav" aria-current="page">
                    Management
                  </button>
                  <button
                    type="button"
                    data-bot="report-documents"
                    onClick={() => go('report', 'documents')}
                    className="uml-nav"
                  >
                    Documents
                  </button>
                  <OwnerLetterButton data={data} onToast={showToast} />
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
            {(activeTab === 'ranch' ||
              activeTab === 'lindon' ||
              (activeTab === 'river' && riverView === 'rental')) && (
              <PropertyDetail
                tab={activeTab}
                data={data}
                history={history}
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
      <CommandPalette
        month={currentMonth}
        activeTab={activeTab}
        onNavigate={(dest) => go(dest.tab, dest.report ?? 'pnl', dest.river ?? 'rental')}
      />
      <AgentChat
        hideLauncher
        month={currentMonth}
        activeTab={
          activeTab === 'guests' || activeTab === 'ours'
            ? 'portfolio'
            : activeTab
        }
        onError={(msg) => showToast(msg, 'error')}
      />
      <ConstructionManagerChat
        hideLauncher
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
