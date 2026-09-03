/** Hash routes bots and humans share: `#/river/build`, `#/report/documents`. */

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
export type RiverView = 'rental' | 'build';

export type DashboardLocation = {
  tab: DashboardTab;
  reportView: ReportView;
  riverView: RiverView;
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
      : tabPart === 'construction'
        ? 'river'
        : tabPart;
  const tab: DashboardTab = isDashboardTab(aliased)
    ? aliased
    : aliased === 'overview'
      ? 'portfolio'
      : 'portfolio';
  const reportView: ReportView =
    tab === 'report' && (parts[1] === 'documents' || parts[1] === 'docs') ? 'documents' : 'pnl';
  const riverView: RiverView =
    tabPart === 'construction' ||
    (tab === 'river' && (parts[1] === 'build' || parts[1] === 'construction'))
      ? 'build'
      : 'rental';
  return { tab, reportView, riverView };
}

export function dashboardHash(loc: DashboardLocation): string {
  if (loc.tab === 'report' && loc.reportView === 'documents') return '#/report/documents';
  if (loc.tab === 'construction' || (loc.tab === 'river' && loc.riverView === 'build')) {
    return '#/river/build';
  }
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
  riverBuild: '[data-bot="nav-construction"]',
  partnerSpend: '[data-bot="partner-spend"]',
  expenseWhat: '[data-bot="expense-what"]',
  expenseAmount: '[data-bot="expense-amount"]',
  expenseSave: '[data-bot="expense-save"]',
  oursExpenseWhat: '[data-bot="ours-expense-what"]',
  oursExpenseAmount: '[data-bot="ours-expense-amount"]',
  oursExpenseText: '[data-bot="ours-expense-text"]',
  oursExpenseReadText: '[data-bot="ours-expense-read-text"]',
  oursExpenseSave: '[data-bot="ours-expense-save"]',
  formImportText: '[data-bot="form-import-text"]',
  formImportRead: '[data-bot="form-import-read"]',
  formStore: '[data-bot="form-store"]',
  formEmail: '[data-bot="form-email"]',
  formSms: '[data-bot="form-sms"]',
} as const;
