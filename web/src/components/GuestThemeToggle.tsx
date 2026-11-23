import { useEffect, useState } from 'react';
import { applyTheme, cycleTheme, readThemeChoice, themeLabel, type ThemeChoice } from '../lib/theme';

/** The same noir / snow / auto switch the host desk uses, on the public pages. */
export function GuestThemeToggle() {
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
      data-bot="guest-theme"
      className="rounded-full border border-[var(--uml-line)] px-3 py-1.5 text-[10px] uppercase tracking-[0.14em] text-[var(--uml-muted)]"
      onClick={() => {
        const next = cycleTheme(choice);
        setChoice(next);
        setResolved(applyTheme(next));
      }}
    >
      {themeLabel(choice, resolved)}
    </button>
  );
}
