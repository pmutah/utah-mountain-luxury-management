import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { api, type HistoryData, type PortfolioData } from './lib/api';
import {
  parseDashboardHash,
  type DashboardTab,
  type ReportView,
  type RiverView,
} from './lib/bot-nav';
import { installUmlBridge, syncDocumentView } from './lib/uml-bridge';
import { seasonFor } from './lib/platform/back-office';
import { setViewer } from './lib/platform/viewer';
import { TabErrorBoundary } from './components/TabErrorBoundary';
import { rescueLegacyLink, servedPath } from './lib/public-paths';
import { LoginGate } from './components/LoginGate';
import { Header } from './components/Header';
import { PortfolioOverview } from './components/PortfolioOverview';
const GuestsPanel = lazy(() =>
  import('./components/GuestsPanel').then((m) => ({ default: m.GuestsPanel })),
);
const PortfolioReport = lazy(() =>
  import('./components/PortfolioReport').then((m) => ({ default: m.PortfolioReport })),
);
const DocumentsVault = lazy(() =>
  import('./components/DocumentsVault').then((m) => ({ default: m.DocumentsVault })),
);
const OurExpenses = lazy(() =>
  import('./components/OurExpenses').then((m) => ({ default: m.OurExpenses })),
);
const ConstructionProjectView = lazy(() =>
  import('./components/ConstructionProject').then((m) => ({ default: m.ConstructionProjectView })),
);
const DirectBook = lazy(() =>
  import('./components/DirectBook').then((m) => ({ default: m.DirectBook })),
);
const HouseSite = lazy(() =>
  import('./components/HouseSite').then((m) => ({ default: m.HouseSite })),
);
const OwnerStatement = lazy(() =>
  import('./components/OwnerStatement').then((m) => ({ default: m.OwnerStatement })),
);
const OwnerPortal = lazy(() =>
  import('./components/OwnerPortal').then((m) => ({ default: m.OwnerPortal })),
);
const CleanLink = lazy(() =>
  import('./components/CleanLink').then((m) => ({ default: m.CleanLink })),
);
const RequestStatus = lazy(() =>
  import('./components/RequestStatus').then((m) => ({ default: m.RequestStatus })),
);
const CleanDesk = lazy(() =>
  import('./components/CleanDesk').then((m) => ({ default: m.CleanDesk })),
);
const AgentsHub = lazy(() =>
  import('./components/AgentsHub').then((m) => ({ default: m.AgentsHub })),
);
const MarketBoard = lazy(() =>
  import('./components/MarketBoard').then((m) => ({ default: m.MarketBoard })),
);
/*
 * The guest-path pages are lazy.
 *
 * `StayApp` pulls in the whole house guide — the prose, the restaurants, the trails — which is most of what made the main
 * bundle 685 kB for every dashboard visitor. It is only ever rendered on a `/stay/` path, and those paths return before
 * the dashboard exists, so a host loading the app should never download it.
 */
const StayApp = lazy(() => import('./components/StayApp').then((m) => ({ default: m.StayApp })));
const GuestPreferenceForm = lazy(() =>
  import('./components/GuestPreferenceForm').then((m) => ({ default: m.GuestPreferenceForm })),
);
const EsignCeremony = lazy(() => import('./components/EsignCeremony').then((m) => ({ default: m.EsignCeremony })));
const PropertyDetail = lazy(() => import('./components/PropertyDetail').then((m) => ({ default: m.PropertyDetail })));
import { LoadingSkeleton } from './components/LoadingSkeleton';
import { ToastStack } from './components/Toast';
import { AgentChat } from './components/AgentChat';
import { ConstructionManagerChat } from './components/ConstructionManagerChat';
import { StayHostThread } from './components/StayHostThread';
import { CommandPalette } from './components/CommandPalette';
import { OwnerLetterButton } from './components/OwnerLetterButton';
import { HomePausedDesk } from './components/HomePausedDesk';
import { HousePausedDesk } from './components/HousePausedDesk';
import { ReportPausedNav } from './components/ReportPausedNav';
import { OwnerRules } from './components/OwnerRules';
import { CleanHouseCards } from './components/CleanHouseCards';
import { RiverLaunch } from './components/RiverLaunch';
import { RiverUnitsPanel } from './components/RiverUnitsPanel';
import { useToast } from './hooks/useToast';
import { letterPausedLine, ownerStatementPausedLine } from './lib/report-paused';
import { currentYearMonth } from './lib/months';

function BooksUnread() {
  return (
    <p className="text-sm text-[var(--uml-muted)]" data-bot="books-unread">
      Saved bookings could not be read. This page is not using a stand-in list. Nothing was written over them.
    </p>
  );
}

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
  const booksPaused = data?.storageReads === 'paused' || history?.storageReads === 'paused';
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

  /*
   * The role the server reported, once, so a control that would answer 403 is not drawn.
   *
   * A failure here leaves the dashboard treating the caller as an admin, which is the present behaviour and the safe one: the
   * server still refuses the write, so a hidden control is a courtesy and never the gate.
   */
  useEffect(() => {
    api
      .getSession()
      .then((session) => {
        if (session.authenticated) {
          setViewer({ role: session.role, readOnly: session.readOnly, houses: session.houses });
        }
      })
      .catch(() => {
        // Unknown is fine. The middleware is the real gate.
      });
  }, []);

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

  /*
   * Only the overview is guarded here, and the guard is on **books being readable**, not on which tab is open.
   *
   * It used to require `activeTab === 'portfolio'` — the "Our expenses" tab — so a host who opened Overview or Guests every
   * morning advanced the seven-day shadow clock by zero. The owner's instruction on 2026-11-10 was to keep the brief recording
   * "in the background" for six more days so auto-pricing can turn on; a tab condition is the opposite of that.
   *
   * `/api/pricing/push-plan` saves the day itself (it already loads all three live boards), and it refuses to save one built
   * from unread or sample data. Fire-and-forget: a failed save must not interrupt the dashboard.
   */
  useEffect(() => {
    if (booksPaused) return;
    void api.getPushPlan().catch(() => undefined);
  }, [booksPaused]);

  useEffect(() => {
    installUmlBridge({
      getState: () => ({ tab: activeTab, reportView, riverView, month: currentMonth }),
      navigate: (loc) => go(loc.tab, loc.reportView, loc.riverView),
      setMonth: setCurrentMonth,
    });
  }, [activeTab, reportView, riverView, currentMonth, go]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.season = seasonFor(currentMonth);
    root.dataset.particles = 'off';
  }, [currentMonth]);

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
          {(['portfolio', 'market', 'agents', 'report', 'owner', 'clean', 'guests', 'ranch', 'lindon', 'river', 'ours'] as const).map((id) => (
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
                : id === 'market'
                  ? 'Market'
                : id === 'agents'
                  ? 'Agents'
                : id === 'report'
                  ? 'Report'
                  : id === 'owner'
                    ? 'Owner'
                  : id === 'clean'
                    ? 'Clean'
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
              data-bot="river-launch"
              aria-current={riverView === 'launch' ? 'page' : undefined}
              onClick={() => go('river', 'pnl', 'launch')}
              className="uml-nav"
            >
              Opening
            </button>
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

        {data?.storageReads === 'paused' && (
          <div
            className="mb-4 rounded-2xl border border-amber-700/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100"
            data-bot="storage-paused"
          >
            Saved expenses and bookings could not be read. Storage reads are paused for the rest of the day.
            Nothing was written over them.
          </div>
        )}
        <TabErrorBoundary>
        <Suspense fallback={<LoadingSkeleton />}>
        {activeTab === 'ours' ? (
          <main>
            <OurExpenses
              onToast={showToast}
              onError={(msg) => showToast(msg, 'error')}
            />
          </main>
        ) : activeTab === 'river' && riverView === 'launch' ? (
          <main>
            <RiverLaunch
              reservations={booksPaused ? [] : (data?.reservations ?? [])}
              bookingsUnreadable={booksPaused}
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
              {data && !booksPaused && <OwnerLetterButton data={data} onToast={showToast} />}
            </div>
            {booksPaused && (
              <p className="text-sm text-[var(--uml-muted)]" data-bot="report-letter-paused">
                {letterPausedLine()}
              </p>
            )}
            <DocumentsVault onToast={showToast} />
          </main>
        ) : activeTab === 'market' ? (
          <main>
            <MarketBoard />
          </main>
        ) : activeTab === 'agents' ? (
          <main>
            <AgentsHub
              reservations={
                booksPaused ? [] : history?.reservations?.length ? history.reservations : (data?.reservations ?? [])
              }
              calendar={booksPaused ? 'off' : data || history?.reservations?.length ? 'live' : loading ? 'loading' : 'off'}
              booksPaused={booksPaused}
            />
          </main>
        ) : loading && !data ? (
          <LoadingSkeleton />
        ) : data ? (
          <main className={loading ? 'opacity-60' : ''}>
            {activeTab === 'guests' && <GuestsPanel onToast={showToast} />}
            {booksPaused &&
              (activeTab === 'portfolio' ||
                activeTab === 'report' ||
                activeTab === 'owner' ||
                activeTab === 'clean' ||
                activeTab === 'ranch' ||
                activeTab === 'lindon' ||
                (activeTab === 'river' && riverView === 'rental')) && <BooksUnread />}
            {activeTab === 'portfolio' && booksPaused && <HomePausedDesk />}
            {activeTab === 'portfolio' && !booksPaused && (
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
            {activeTab === 'report' && booksPaused && <ReportPausedNav onDocuments={() => go('report', 'documents')} />}
            {activeTab === 'report' && !booksPaused && (
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
            {activeTab === 'owner' && <OwnerRules />}
            {activeTab === 'owner' && booksPaused && (
              <p className="uml-panel mb-6 rounded-3xl p-6 text-sm" data-bot="owner-statement-paused">
                {ownerStatementPausedLine()}
              </p>
            )}
            {activeTab === 'owner' && !booksPaused && (
              <OwnerStatement
                month={currentMonth}
                reservations={data.reservations}
                expenses={data.expenses}
                extraCleaningFees={extraCleaningFees}
              />
            )}
            {activeTab === 'clean' && booksPaused && <CleanHouseCards />}
            {activeTab === 'clean' && !booksPaused && (
              <CleanDesk
                reservations={history?.reservations?.length ? history.reservations : data.reservations}
              />
            )}
            {booksPaused &&
              (activeTab === 'ranch' || activeTab === 'lindon' || (activeTab === 'river' && riverView === 'rental')) && (
                <HousePausedDesk house={activeTab === 'lindon' ? 'lindon' : activeTab === 'ranch' ? 'ranch' : 'river'} />
              )}
            {!booksPaused &&
              (activeTab === 'ranch' ||
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
            {/*
              The Riverhouse can be sold whole or in three parts, so the parts have their own card on the River rental
              view. It sits outside PropertyDetail because the three houses share that component and only River has
              units; a unit is part of the river house, not a fourth house.
            */}
            {!booksPaused && activeTab === 'river' && riverView === 'rental' && (
              <div className="mt-6">
                <RiverUnitsPanel onToast={showToast} />
              </div>
            )}
          </main>
        ) : null}
        </Suspense>
        </TabErrorBoundary>
      </div>
      <nav
          aria-label="Primary"
          className="fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-[var(--uml-line)] bg-[color-mix(in_srgb,var(--uml-bg)_92%,transparent)] px-2 py-2 backdrop-blur md:hidden"
        >
          {(
            [
              ['portfolio', 'Overview'],
              ['market', 'Market'],
              ['guests', 'Guests'],
              ['ours', 'Expenses'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-bot={`dock-${id}`}
              aria-current={activeTab === id ? 'page' : undefined}
              onClick={() => go(id)}
              className="uml-nav"
            >
              {label}
            </button>
          ))}
        </nav>
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
  /*
   * A quote link sent before the paths were fixed arrives here as `/?house=river` â€” the host's 308 kept
   * the query and dropped the path. Hand it to the booking page instead of showing a guest a login form.
   *
   * The path is rewritten with `replaceState` so the address bar shows the real URL and a reload keeps
   * working, and the booking page is rendered directly. Reloading instead would throw away the app and
   * re-fetch everything for what is only a path correction.
   */
  if (rescueLegacyLink(window.location.pathname, window.location.search)) {
    window.history.replaceState(null, '', servedPath('/book', window.location.search));
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        <DirectBook />
      </Suspense>
    );
  }
  const hostMatch = window.location.pathname.match(/^\/stay\/([^/]+)\/host\/?$/);
  if (hostMatch?.[1]) {
    return (
      <LoginGate>
        <StayHostThread token={decodeURIComponent(hostMatch[1])} />
      </LoginGate>
    );
  }
  const stayMatch = window.location.pathname.match(/^\/stay\/([^/]+)(\/preferences)?\/?$/);
  if (stayMatch?.[1]) {
    const token = decodeURIComponent(stayMatch[1]);
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        {stayMatch[2] ? <GuestPreferenceForm token={token} /> : <StayApp token={token} />}
      </Suspense>
    );
  }
  const esignMatch = window.location.pathname.match(/^\/esign\/([^/]+)/);
  if (esignMatch?.[1]) {
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        <EsignCeremony token={esignMatch[1]} />
      </Suspense>
    );
  }
  const ownerMatch = window.location.pathname.match(/^\/owner\/([a-f0-9]{32})\/?$/);
  if (ownerMatch?.[1]) {
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        <OwnerPortal token={ownerMatch[1]} />
      </Suspense>
    );
  }
  // The guest's own view of a direct request. The token is the credential, so there is no gate.
  const requestMatch = window.location.pathname.match(/^\/request\/([a-f0-9]{32})\/?$/);
  if (requestMatch?.[1]) {
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        <RequestStatus token={requestMatch[1]} />
      </Suspense>
    );
  }
  const cleanMatch = window.location.pathname.match(/^\/clean\/([a-f0-9]{32})\/?$/);
  if (cleanMatch?.[1]) {
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        <CleanLink token={cleanMatch[1]} />
      </Suspense>
    );
  }
  if (window.location.pathname === '/houses' || window.location.pathname.startsWith('/houses/')) {
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        <HouseSite />
      </Suspense>
    );
  }
  if (window.location.pathname === '/book' || window.location.pathname.startsWith('/book/')) {
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        <DirectBook />
      </Suspense>
    );
  }
  return (
    <LoginGate>
      <Dashboard />
    </LoginGate>
  );
}

