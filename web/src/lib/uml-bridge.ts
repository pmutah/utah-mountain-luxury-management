import {
  BOT_SELECTORS,
  DASHBOARD_TABS,
  dashboardHash,
  type DashboardLocation,
  type DashboardTab,
  type ReportView,
} from './bot-nav';

export type UmlBridgeState = DashboardLocation & { month: string };

type UmlBridge = {
  version: 1;
  /** Current tab, report subview, and YYYY-MM. */
  state: () => UmlBridgeState;
  /** Switch screen without clicking the nav (preferred for browser agents). */
  navigate: (tab: DashboardTab | 'overview', reportView?: ReportView) => void;
  setMonth: (month: string) => void;
  selectors: typeof BOT_SELECTORS;
  tabs: typeof DASHBOARD_TABS;
  help: () => string;
};

declare global {
  interface Window {
    UML?: UmlBridge;
  }
}

export function installUmlBridge(opts: {
  getState: () => UmlBridgeState;
  navigate: (loc: DashboardLocation) => void;
  setMonth: (month: string) => void;
}): void {
  const navigate = (tab: DashboardTab | 'overview', reportView?: ReportView) => {
    if (tab === 'construction') {
      opts.navigate({ tab: 'river', reportView: 'pnl', riverView: 'build' });
      return;
    }
    const resolved: DashboardTab = tab === 'overview' ? 'portfolio' : tab;
    opts.navigate({
      tab: resolved,
      reportView: resolved === 'report' ? (reportView ?? 'pnl') : 'pnl',
      riverView: resolved === 'river' ? 'rental' : 'rental',
    });
  };

  window.UML = {
    version: 1,
    state: opts.getState,
    navigate,
    setMonth: opts.setMonth,
    selectors: BOT_SELECTORS,
    tabs: DASHBOARD_TABS,
    help: () =>
      [
        'Utah Mountain Luxury dashboard bridge for browser agents.',
        'Navigate: UML.navigate("river") or UML.navigate("construction") for River House build costs',
        'Month: UML.setMonth("2026-08")',
        'State: UML.state()',
        'Hash routes: #/overview #/report #/report/documents #/guests #/ranch #/lindon #/river #/river/build #/ours',
        'Map: GET /api/agent/map  ·  Guide: GET /llms.txt',
      ].join('\n'),
  };
}

export function syncDocumentView(loc: DashboardLocation, month: string): void {
  const root = document.documentElement;
  root.dataset.umlTab = loc.tab === 'construction' ? 'river' : loc.tab;
  root.dataset.umlReport = loc.reportView;
  root.dataset.umlRiver = loc.tab === 'river' || loc.tab === 'construction' ? loc.riverView : '';
  root.dataset.umlMonth = month;
  if (window.location.hash !== dashboardHash(loc)) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${dashboardHash(loc)}`);
  }
}
