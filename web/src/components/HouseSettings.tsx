import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type HouseConfig = {
  houseRules?: string;
  lockCodeTemplate?: string;
  cleanerEmail?: string;
  cleanerPhone?: string;
};

type HouseId = 'ranch' | 'lindon' | 'river';

const HOUSE: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};
const ORDER: HouseId[] = ['river', 'ranch', 'lindon'];

/**
 * The house rules and check-in wording a guest actually receives.
 *
 * These were stored and read by the check-in draft and the cleaner notice, but no screen could write
 * them, so every guest got the hardcoded default and a host had no way to change what their own guest
 * was told. The panel stays narrow for that reason: it edits only the fields those messages use.
 */
export function HouseSettings() {
  const [house, setHouse] = useState<HouseId>('river');
  const [config, setConfig] = useState<Record<string, HouseConfig> | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'paused'>('loading');
  const [draft, setDraft] = useState<HouseConfig>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api
      .getHouseSettings()
      .then((result) => {
        if (result.storageReads === 'paused' || !result.config) {
          // An unreadable config is not an empty one: showing blank fields would invite a save that
          // wipes the rules a guest is already receiving.
          setState('paused');
          return;
        }
        setConfig(result.config);
        setState('ready');
      })
      .catch(() => setState('paused'));
  }, []);

  useEffect(() => {
    if (!config) return;
    setDraft(config[house] ?? {});
    setNotice(null);
    setError(null);
  }, [house, config]);

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await api.saveHouseSettings({
        house,
        ...(draft.houseRules ? { houseRules: draft.houseRules } : {}),
        ...(draft.lockCodeTemplate ? { lockCodeTemplate: draft.lockCodeTemplate } : {}),
        ...(draft.cleanerEmail ? { cleanerEmail: draft.cleanerEmail } : {}),
        ...(draft.cleanerPhone ? { cleanerPhone: draft.cleanerPhone } : {}),
      });
      const fresh = await api.getHouseSettings();
      if (fresh.config) setConfig(fresh.config);
      setNotice(`Saved for ${HOUSE[result.house as HouseId] ?? result.house}. The next check-in draft and cleaner notice use it.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Those settings could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="house-settings">
      <p className="uml-kicker">House rules the guest receives</p>
      <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
        These lines go into the check-in draft and the cleaner notice for that house. Leaving a field blank keeps
        what is already saved, so nothing is wiped by accident.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {ORDER.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setHouse(id)}
            data-bot="house-settings-pick"
            data-house={id}
            aria-pressed={house === id}
            className={`rounded-full border px-3 py-1 text-xs uppercase tracking-[0.12em] ${
              house === id ? 'border-[var(--uml-gold)] text-[var(--uml-gold)]' : 'border-[var(--uml-line)]'
            }`}
          >
            {HOUSE[id]}
          </button>
        ))}
      </div>

      {state === 'paused' && (
        <p className="mt-4 text-sm" data-bot="house-settings-paused">
          The saved house settings could not be read. They are not empty, and nothing is shown as blank.
        </p>
      )}
      {notice && (
        <p className="mt-4 text-sm" data-bot="house-settings-saved">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm" data-bot="house-settings-error">
          {error}
        </p>
      )}

      {state === 'ready' && (
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            House rules
            <textarea
              value={draft.houseRules ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, houseRules: event.target.value }))}
              data-bot="house-settings-rules"
              rows={4}
              className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Check-in line
            <input
              value={draft.lockCodeTemplate ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, lockCodeTemplate: event.target.value }))}
              data-bot="house-settings-lock"
              className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Cleaner email
            <input
              value={draft.cleanerEmail ?? ''}
              onChange={(event) => setDraft((current) => ({ ...current, cleanerEmail: event.target.value }))}
              data-bot="house-settings-cleaner-email"
              className="mt-1 w-full rounded-xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            data-bot="house-settings-save"
            className="rounded-full border border-[var(--uml-gold)] px-4 py-1.5 text-xs uppercase tracking-[0.16em] text-[var(--uml-gold)] disabled:opacity-50"
          >
            {busy ? 'Saving…' : `Save ${HOUSE[house]}`}
          </button>
        </div>
      )}
    </section>
  );
}
