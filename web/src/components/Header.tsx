import { useEffect, useState } from 'react';
import { APP_NAME } from '../lib/brand';
import { formatMonthLabel, addMonths } from '../lib/months';
import { applyTheme, cycleTheme, readThemeChoice, themeLabel, type ThemeChoice } from '../lib/theme';
import { BrandMark } from './BrandMark';

export function Header({
  month,
  onMonthChange,
}: {
  month: string;
  onMonthChange: (m: string) => void;
}) {
  const [choice, setChoice] = useState<ThemeChoice>('noir');
  const [resolved, setResolved] = useState<'noir' | 'snow'>('noir');

  useEffect(() => {
    const initial = readThemeChoice();
    setChoice(initial);
    setResolved(applyTheme(initial));
  }, []);

  const toggleTheme = () => {
    const next = cycleTheme(choice);
    setChoice(next);
    setResolved(applyTheme(next));
  };

  return (
    <header className="sticky top-0 z-40 -mx-4 px-4 py-4 mb-6 backdrop-blur-md border-b border-[var(--uml-line)] bg-[color-mix(in_srgb,var(--uml-bg)_88%,transparent)]">
      <div className="max-w-6xl mx-auto flex flex-wrap justify-between items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-4">
          <BrandMark />
          <div>
            <p className="uml-kicker">Utah Mountain Luxury</p>
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
            className="px-3 py-2 text-[var(--uml-muted)] hover:text-[var(--uml-ink)]"
            aria-label="Previous month"
          >
            ‹
          </button>
          <label className="relative flex-1 sm:flex-none text-center cursor-pointer min-w-[10rem]">
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
            className="px-3 py-2 text-[var(--uml-muted)] hover:text-[var(--uml-ink)]"
            aria-label="Next month"
          >
            ›
          </button>
          <button
            type="button"
            onClick={toggleTheme}
            className="uml-kicker px-3 py-2 rounded-full border border-[var(--uml-line)]"
          >
            {themeLabel(choice, resolved)}
          </button>
          <button
            type="button"
            data-bot="command"
            className="uml-kicker px-3 py-2 rounded-full border border-[var(--uml-gold)] text-[var(--uml-gold)]"
            onClick={() => window.dispatchEvent(new CustomEvent('uml:command'))}
          >
            Ask
          </button>
          <button
            type="button"
            data-bot="open-cohost"
            className="uml-kicker px-3 py-2 rounded-full border border-[var(--uml-line)]"
            onClick={() => window.dispatchEvent(new CustomEvent('uml:open-cohost'))}
          >
            Co-host
          </button>
          <button
            type="button"
            data-bot="open-build"
            className="uml-kicker px-3 py-2 rounded-full border border-[var(--uml-line)]"
            onClick={() => window.dispatchEvent(new CustomEvent('uml:open-build'))}
          >
            Build
          </button>
        </div>
      </div>
    </header>
  );
}
