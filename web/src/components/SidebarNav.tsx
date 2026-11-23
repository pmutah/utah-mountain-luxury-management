import { Fragment, useEffect, useState, type ReactNode } from 'react';
import {
  Bot,
  CalendarDays,
  FileSpreadsheet,
  Hammer,
  Home,
  LayoutDashboard,
  LineChart,
  PanelLeft,
  Receipt,
  Sparkles,
  Trees,
  Users,
  Waves,
} from 'lucide-react';
import type { DashboardTab, ReportView, RiverView } from '../lib/bot-nav';
import { api } from '../lib/api';
import { applyTheme, cycleTheme, readThemeChoice, themeLabel, type ThemeChoice } from '../lib/theme';

type Go = (tab: DashboardTab, report?: ReportView, river?: RiverView) => void;

type Item = {
  id: string;
  label: string;
  icon: typeof Home;
  bot: string;
  current: boolean;
  badge?: number;
  hidden?: boolean;
  onClick: () => void;
};

function ItemButton({ item, collapsed }: { item: Item; collapsed: boolean }) {
  if (item.hidden) return null;
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-bot={item.bot}
      aria-current={item.current ? 'page' : undefined}
      title={item.label}
      onClick={item.onClick}
      className="uml-side"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className={collapsed ? 'sr-only' : 'truncate'}>{item.label}</span>
      {!collapsed && item.badge && item.badge > 0 ? (
        <span className="ml-auto rounded-full bg-[var(--uml-gold)] px-1.5 text-[10px] font-bold text-[var(--uml-gold-ink)]">
          {item.badge}
        </span>
      ) : null}
    </button>
  );
}

export function SidebarNav({
  activeTab,
  riverView,
  reportView,
  collapsed,
  hideLindon,
  guestBadge,
  cleanBadge,
  onToggle,
  onGo,
}: {
  activeTab: DashboardTab;
  riverView: RiverView;
  reportView: ReportView;
  collapsed: boolean;
  hideLindon: boolean;
  guestBadge: number;
  cleanBadge: number;
  onToggle: () => void;
  onGo: Go;
}) {
  const operations: Item[] = [
    {
      id: 'portfolio',
      label: 'Overview',
      icon: LayoutDashboard,
      bot: 'nav-portfolio',
      current: activeTab === 'portfolio',
      onClick: () => onGo('portfolio'),
    },
    {
      id: 'calendar',
      label: 'Calendar',
      icon: CalendarDays,
      bot: 'nav-calendar',
      current: activeTab === 'calendar',
      onClick: () => onGo('calendar'),
    },
    {
      id: 'guests',
      label: 'Guests',
      icon: Users,
      bot: 'nav-guests',
      current: activeTab === 'guests',
      badge: guestBadge,
      onClick: () => onGo('guests'),
    },
    {
      id: 'clean',
      label: 'Clean',
      icon: Sparkles,
      bot: 'nav-clean',
      current: activeTab === 'clean',
      badge: cleanBadge,
      onClick: () => onGo('clean'),
    },
  ];
  const properties: Item[] = [
    {
      id: 'river',
      label: 'River',
      icon: Waves,
      bot: 'nav-river',
      current: activeTab === 'river',
      onClick: () => onGo('river', 'pnl', 'rental'),
    },
    {
      id: 'ranch',
      label: 'Ranch',
      icon: Trees,
      bot: 'nav-ranch',
      current: activeTab === 'ranch',
      onClick: () => onGo('ranch'),
    },
    {
      id: 'lindon',
      label: 'Lindon',
      icon: Home,
      bot: 'nav-lindon',
      current: activeTab === 'lindon',
      hidden: hideLindon,
      onClick: () => onGo('lindon'),
    },
  ];
  const finance: Item[] = [
    {
      id: 'market',
      label: 'Market',
      icon: LineChart,
      bot: 'nav-market',
      current: activeTab === 'market',
      onClick: () => onGo('market'),
    },
    {
      id: 'report',
      label: 'Report',
      icon: Receipt,
      bot: 'nav-report',
      current: activeTab === 'report' && reportView !== 'documents',
      onClick: () => onGo('report', 'pnl'),
    },
    {
      id: 'owner',
      label: 'Owner',
      icon: Receipt,
      bot: 'nav-owner',
      current: activeTab === 'owner',
      onClick: () => onGo('owner'),
    },
    {
      id: 'tax',
      label: 'Tax & CPA',
      icon: FileSpreadsheet,
      bot: 'nav-tax',
      current: activeTab === 'tax',
      hidden: hideLindon,
      onClick: () => onGo('tax'),
    },
    {
      id: 'ours',
      label: 'Our expenses',
      icon: Receipt,
      bot: 'nav-ours',
      current: activeTab === 'ours',
      onClick: () => onGo('ours'),
    },
  ];

  return (
    <aside
      className="uml-sidebar sticky top-0 z-30 hidden h-dvh shrink-0 flex-col border-r border-[var(--uml-line)] bg-[color-mix(in_srgb,var(--uml-bg)_92%,transparent)] backdrop-blur md:flex"
      data-collapsed={collapsed ? 'true' : 'false'}
      aria-label="Dashboard screens"
    >
      <div className="flex items-center gap-2 px-3 py-4">
        <button type="button" className="uml-side justify-center" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
          <PanelLeft className="h-4 w-4" />
          <span className="sr-only">{collapsed ? 'Expand' : 'Collapse'}</span>
        </button>
        {collapsed ? null : <p className="uml-kicker">Utah Mountain Luxury</p>}
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-2 pb-6">
        <Section label="Operations" collapsed={collapsed}>
          {operations.map((item) => (
            <ItemButton key={item.id} item={item} collapsed={collapsed} />
          ))}
        </Section>
        <Section label="Properties" collapsed={collapsed}>
          {properties.map((item) => (
            <Fragment key={item.id}>
              <ItemButton item={item} collapsed={collapsed} />
              {item.id === 'river' && activeTab === 'river' ? (
                <div className={collapsed ? '' : 'ml-3 border-l border-[var(--uml-line)] pl-2'}>
                  <button
                    type="button"
                    data-bot="river-launch"
                    aria-current={riverView === 'launch' ? 'page' : undefined}
                    title="Opening"
                    onClick={() => onGo('river', 'pnl', 'launch')}
                    className="uml-side"
                  >
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span className={collapsed ? 'sr-only' : ''}>Opening</span>
                  </button>
                  <button
                    type="button"
                    data-bot="river-rental"
                    aria-current={riverView === 'rental' ? 'page' : undefined}
                    title="Rental"
                    onClick={() => onGo('river', 'pnl', 'rental')}
                    className="uml-side"
                  >
                    <Waves className="h-4 w-4 shrink-0" />
                    <span className={collapsed ? 'sr-only' : ''}>Rental</span>
                  </button>
                  <button
                    type="button"
                    data-bot="nav-construction"
                    aria-current={riverView === 'build' ? 'page' : undefined}
                    title="Build costs"
                    onClick={() => onGo('river', 'pnl', 'build')}
                    className="uml-side"
                  >
                    <Hammer className="h-4 w-4 shrink-0" />
                    <span className={collapsed ? 'sr-only' : ''}>Build costs</span>
                  </button>
                </div>
              ) : null}
            </Fragment>
          ))}
        </Section>
        <Section label="Finance" collapsed={collapsed}>
          {finance.map((item) => (
            <ItemButton key={item.id} item={item} collapsed={collapsed} />
          ))}
        </Section>
        <Section label="Intelligence" collapsed={collapsed}>
          <ItemButton
            collapsed={collapsed}
            item={{
              id: 'agents',
              label: 'Agents',
              icon: Bot,
              bot: 'nav-agents',
              current: activeTab === 'agents',
              onClick: () => onGo('agents'),
            }}
          />
        </Section>
      </div>
      <div className="space-y-2 border-t border-[var(--uml-line)] px-2 py-3">
        <ThemeSwitch collapsed={collapsed} />
        <IntegrationPulse collapsed={collapsed} />
      </div>
    </aside>
  );
}

function ThemeSwitch({ collapsed }: { collapsed: boolean }) {
  const [choice, setChoice] = useState<ThemeChoice>('noir');
  const [resolved, setResolved] = useState<'noir' | 'snow'>('noir');
  useEffect(() => {
    const initial = readThemeChoice();
    setChoice(initial);
    setResolved(applyTheme(initial));
  }, []);
  return (
    <button
      type="button"
      className="uml-side"
      title="Theme"
      onClick={() => {
        const next = cycleTheme(choice);
        setChoice(next);
        setResolved(applyTheme(next));
      }}
    >
      <Sparkles className="h-4 w-4 shrink-0" />
      <span className={collapsed ? 'sr-only' : ''}>{themeLabel(choice, resolved)}</span>
    </button>
  );
}

function IntegrationPulse({ collapsed }: { collapsed: boolean }) {
  const [line, setLine] = useState('Reading integrations');
  useEffect(() => {
    let cancel = false;
    void Promise.all([
      api.getGmailStatus().then((status) => (status.connected ? 'Gmail on' : 'Gmail off')).catch(() => 'Gmail unread'),
      fetch('/api/platform/health', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : null))
        .then((body: { keys?: { stripeTest?: boolean } } | null) => {
          if (!body?.keys) return 'Stripe unread';
          return body.keys.stripeTest ? 'Stripe test key' : 'Stripe key absent';
        })
        .catch(() => 'Stripe unread'),
    ]).then(([gmail, stripe]) => {
      if (!cancel) setLine(`${gmail} · ${stripe}`);
    });
    return () => {
      cancel = true;
    };
  }, []);
  return (
    <p className="px-2 text-[10px] uppercase tracking-[0.12em] text-[var(--uml-muted)]" data-bot="integration-pulse" title={line}>
      {collapsed ? '●' : line}
    </p>
  );
}

function Section({ label, collapsed, children }: { label: string; collapsed: boolean; children: ReactNode }) {
  return (
    <div>
      {collapsed ? null : <p className="uml-kicker px-2 pb-1">{label}</p>}
      <div className="space-y-1">{children}</div>
    </div>
  );
}
