/** Hash routes bots and humans share: `#/construction`, `#/report/documents`. */

export const DASHBOARD_TABS = [
  'portfolio',
  'report',
  'guests',
  'ranch',
  'lindon',
  'river',
  'ours',
  'construction',
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];
export type ReportView = 'pnl' | 'documents';

export type DashboardLocation = {
  tab: DashboardTab;
  reportView: ReportView;
};

export function isDashboardTab(value: string): value is DashboardTab {
  return (DASHBOARD_TABS as readonly string[]).includes(value);
}

export function parseDashboardHash(hash: string): DashboardLocation {
  const raw = hash.replace(/^#/, '').replace(/^\//, '').trim();
  const parts = raw.split('/').filter(Boolean);
  const tabPart = parts[0] || 'portfolio';
  const aliased =
    tabPart === 'household' || tabPart === 'furnishings' || tabPart === 'our-expenses'
      ? 'ours'
      : tabPart;
  const tab: DashboardTab = isDashboardTab(aliased)
    ? aliased
    : aliased === 'overview'
      ? 'portfolio'
      : 'portfolio';
  const reportView: ReportView =
    tab === 'report' && (parts[1] === 'documents' || parts[1] === 'docs') ? 'documents' : 'pnl';
  return { tab, reportView };
}

export function dashboardHash(loc: DashboardLocation): string {
  if (loc.tab === 'report' && loc.reportView === 'documents') return '#/report/documents';
  if (loc.tab === 'portfolio') return '#/overview';
  return `#/${loc.tab}`;
}

export const BOT_SELECTORS = {
  nav: (tab: DashboardTab) => `[data-bot="nav-${tab}"]`,
  month: '[data-bot="month"]',
  loginPassword: '[data-bot="login-password"]',
  loginSubmit: '[data-bot="login-submit"]',
  cohost: '[data-bot="open-cohost"]',
  build: '[data-bot="open-build"]',
  partnerSpend: '[data-bot="partner-spend"]',
  expenseWhat: '[data-bot="expense-what"]',
  expenseAmount: '[data-bot="expense-amount"]',
  expenseSave: '[data-bot="expense-save"]',
} as const;
