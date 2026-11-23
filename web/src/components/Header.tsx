import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { APP_NAME } from '../lib/brand';
import type { DashboardTab, ReportView, RiverView } from '../lib/bot-nav';
import { formatMonthLabel, addMonths } from '../lib/months';
import { BrandMark } from './BrandMark';

const SCREEN_LABELS: Record<DashboardTab, string> = {
  portfolio: 'Overview',
  calendar: 'Tape Calendar',
  market: 'Market & Pricing',
  report: 'Management P&L',
  guests: 'Guests & Inbox',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
  river: 'The River House',
  ours: 'Our Expenses',
  owner: 'Owner Statement',
  tax: 'Tax & CPA Desk',
  clean: 'Cleaner Desk',
  agents: 'AI Agents & Ops',
  construction: 'River Build Costs',
};

export function Header({
  month,
  activeTab,
  reportView,
  riverView,
  onMonthChange,
  onQuickCapture,
}: {
  month: string;
  activeTab?: DashboardTab;
  reportView?: ReportView;
  riverView?: RiverView;
  onMonthChange: (m: string) => void;
  onQuickCapture?: () => void;
}) {
  const [askOpen, setAskOpen] = useState(false);
  const askRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!askOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAskOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && askRef.current?.contains(target)) return;
      setAskOpen(false);
    };
    const onAway = () => setAskOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('hashchange', onAway);
    document.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', onAway);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [askOpen]);
  // Keyboard `[` and `]` step months when no form field has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === '[') {
        onMonthChange(addMonths(month, -1));
      } else if (e.key === ']') {
        onMonthChange(addMonths(month, 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [month, onMonthChange]);

  const screenTitle =
    activeTab === 'report' && reportView === 'documents'
      ? 'Documents & E-Sign'
      : activeTab === 'river' && riverView === 'build'
        ? 'River Build Costs'
        : activeTab === 'river' && riverView === 'launch'
          ? 'River Opening'
          : activeTab
            ? SCREEN_LABELS[activeTab]
            : null;

  return (
    <header className="sticky top-0 z-40 -mx-4 px-4 py-4 mb-6 backdrop-blur-md border-b border-[var(--uml-line)] bg-[color-mix(in_srgb,var(--uml-bg)_88%,transparent)]">
      <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-4">
          <BrandMark />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="uml-kicker">Utah Mountain Luxury</p>
              {screenTitle && (
                <span
                  className="rounded-full border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/70 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[var(--uml-gold)]"
                  data-bot="header-breadcrumb"
                >
                  {screenTitle}
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-[1.7rem] leading-none text-[var(--uml-ink)]">
              {APP_NAME.replace(' Management', '')}
            </h1>
            <p className="font-display italic text-sm text-[var(--uml-muted)] mt-1">
              Ranch · Lindon · River
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, -1))}
            className="px-2.5 py-2 text-[var(--uml-muted)] hover:text-[var(--uml-ink)]"
            aria-label="Previous month"
            title="Previous month ([)"
          >
            ‹
          </button>
          <label className="relative flex-1 sm:flex-none text-center cursor-pointer min-w-[9.5rem]">
            <span className="font-display text-xl text-[var(--uml-ink)]">{formatMonthLabel(month)}</span>
            <input
              type="month"
              value={month}
              onChange={(e) => onMonthChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label="Select month"
              data-bot="month"
            />
          </label>
          <button
            type="button"
            onClick={() => onMonthChange(addMonths(month, 1))}
            className="px-2.5 py-2 text-[var(--uml-muted)] hover:text-[var(--uml-ink)]"
            aria-label="Next month"
            title="Next month (])"
          >
            ›
          </button>
          <a
            href="/houses/"
            target="_blank"
            rel="noreferrer"
            data-bot="header-guest-site"
            className="uml-kicker hidden sm:inline-flex items-center gap-1 px-3 py-2 rounded-full border border-[var(--uml-line)] hover:border-[var(--uml-gold)] hover:text-[var(--uml-gold)] transition-colors"
            title="Open live direct-booking website"
          >
            Guest site <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
          <button
            type="button"
            data-bot="quick-capture"
            className="uml-kicker px-3 py-2 rounded-full border border-[var(--uml-gold)] text-[var(--uml-gold)]"
            onClick={onQuickCapture}
          >
            + Log
          </button>
          <div className="relative" ref={askRef}>
            <button
              type="button"
              className="uml-kicker rounded-full border border-[var(--uml-gold)] px-3 py-2 text-[var(--uml-gold)]"
              aria-expanded={askOpen}
              aria-haspopup="menu"
              onClick={() => setAskOpen((open) => !open)}
            >
              Ask
            </button>
            {askOpen ? (
              <div
                role="menu"
                className="absolute right-0 z-20 mt-2 flex w-40 flex-col gap-1 rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-bg)] p-2 shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  data-bot="command"
                  className="uml-side"
                  onClick={() => {
                    setAskOpen(false);
                    window.dispatchEvent(new CustomEvent('uml:command'));
                  }}
                >
                  Search ⌘K
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-bot="open-cohost"
                  className="uml-side"
                  onClick={() => {
                    setAskOpen(false);
                    window.dispatchEvent(new CustomEvent('uml:open-cohost'));
                  }}
                >
                  Co-host
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-bot="open-build"
                  className="uml-side"
                  onClick={() => {
                    setAskOpen(false);
                    window.dispatchEvent(new CustomEvent('uml:open-build'));
                  }}
                >
                  Build
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
