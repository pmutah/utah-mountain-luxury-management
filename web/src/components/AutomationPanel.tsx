import { useEffect, useState } from 'react';
import { api, type AutomationSettings } from '../lib/api';

const EMPTY: AutomationSettings = {
  guestPrep: false,
  monthlyLetter: false,
  letterTo: '',
  cleanerPhone: '',
};

export function AutomationPanel({
  onToast,
}: {
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [settings, setSettings] = useState<AutomationSettings>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getAutomation()
      .then((next) => {
        if (cancelled) return;
        setSettings(next);
        setLoaded(true);
        if (next.guestPrep || next.monthlyLetter) void api.runAutomation().catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(next: AutomationSettings) {
    setSettings(next);
    try {
      const saved = await api.saveAutomation(next);
      setSettings(saved);
      onToast('Automation saved', 'success');
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not save automation', 'error');
    }
  }

  if (!loaded) return null;

  return (
    <section className="uml-panel rounded-3xl p-5 space-y-4">
      <div>
        <p className="uml-kicker">Automation</p>
        <h2 className="font-display text-2xl">Guest prep and the monthly letter</h2>
        <p className="text-sm text-[var(--uml-muted)] mt-1">
          Both start off. Guest prep, when on, emails or texts the preference form three days before arrival, texts the cleaner, and sends a thank-you on checkout. The letter emails on the first open of each month.
        </p>
      </div>
      <label className="flex items-center justify-between gap-4">
        <span>Guest prep and thank-yous</span>
        <input
          type="checkbox"
          checked={settings.guestPrep}
          onChange={(e) => void save({ ...settings, guestPrep: e.target.checked })}
        />
      </label>
      <label className="flex items-center justify-between gap-4">
        <span>Email the monthly letter</span>
        <input
          type="checkbox"
          checked={settings.monthlyLetter}
          onChange={(e) => void save({ ...settings, monthlyLetter: e.target.checked })}
        />
      </label>
      <label className="block text-sm">
        <span className="uml-kicker">Letter recipients</span>
        <input
          value={settings.letterTo}
          onChange={(e) => setSettings({ ...settings, letterTo: e.target.value })}
          onBlur={() => void save(settings)}
          placeholder="name@email.com, partner@email.com"
          className="mt-1 w-full bg-transparent border border-[var(--uml-line)] rounded-2xl px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        <span className="uml-kicker">Cleaner mobile</span>
        <input
          value={settings.cleanerPhone}
          onChange={(e) => setSettings({ ...settings, cleanerPhone: e.target.value })}
          onBlur={() => void save(settings)}
          placeholder="801-000-0000"
          className="mt-1 w-full bg-transparent border border-[var(--uml-line)] rounded-2xl px-3 py-2"
        />
      </label>
    </section>
  );
}
