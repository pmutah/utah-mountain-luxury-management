import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

type Link = { token: string; label: string; path: string; createdAt: string; lastViewedAt: string | null; views: number };

/**
 * Links for cleaners. A cleaner opens `/clean/<token>` on a phone with no login. Minting one does
 * not text or email it, and a link carries no door code or guest name.
 */
export function CleanLinkPanel() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [label, setLabel] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'paused' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<string | null>(null);

  const load = useCallback(() => {
    void api
      .getCleanLinks()
      .then((result) => {
        if (result.storageReads === 'paused' || result.links === null) {
          setState('paused');
          setLinks(null);
          return;
        }
        setLinks(result.links);
        setState('ready');
      })
      .catch(() => setState('error'));
  }, []);

  useEffect(() => {
    let cancel = false;
    void api
      .getCleanLinks()
      .then((result) => {
        if (cancel) return;
        if (result.storageReads === 'paused' || result.links === null) {
          setState('paused');
          setLinks(null);
          return;
        }
        setLinks(result.links);
        setState('ready');
      })
      .catch(() => {
        if (!cancel) setState('error');
      });
    return () => {
      cancel = true;
    };
  }, []);

  async function mint() {
    if (!label.trim()) {
      setMade('Add a name for the cleaner first.');
      return;
    }
    setBusy(true);
    setMade(null);
    try {
      const created = await api.mintCleanLink(label.trim());
      setLabel('');
      setMade(`Sent link ready: ${created.path} — text it to ${created.label}. Nothing was texted from here.`);
      load();
    } catch (err) {
      setMade(err instanceof Error ? err.message : 'The link could not be made.');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    setBusy(true);
    try {
      await api.revokeCleanLink(token);
      load();
    } catch (err) {
      setMade(err instanceof Error ? err.message : 'The link could not be taken back.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="uml-panel rounded-3xl p-6" data-bot="clean-link-panel">
      <p className="uml-kicker">Cleaner link</p>
      <p className="mt-2 text-sm text-[var(--uml-muted)]">
        A cleaner opens this on a phone with no login. It shows the house, the day, the steps, and how to get in.
        It does not carry a door code, a guest name, or a rate. Making a link does not text it.
      </p>
      {state === 'paused' && (
        <p className="mt-4 text-sm" data-bot="clean-link-paused">
          The cleaner links could not be read. This is not an empty list, and nothing was written over them.
        </p>
      )}
      {state === 'error' && (
        <p className="mt-4 text-sm" data-bot="clean-link-error">
          The cleaner links could not be read just now. Nothing was written.
        </p>
      )}
      {made && (
        <p className="mt-4 break-all text-sm" data-bot="clean-link-made">
          {made}
        </p>
      )}
      {links && links.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {links.map((link) => (
            <li key={link.token} data-bot="clean-link-row" className="rounded-2xl border border-[var(--uml-line)] px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-all">{link.path}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void revoke(link.token)}
                  data-bot="clean-link-revoke"
                  className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-xs uppercase tracking-[0.16em] disabled:opacity-50"
                >
                  Take back
                </button>
              </div>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">
                {link.views === 0
                  ? 'Not opened yet.'
                  : `Opened ${link.views === 1 ? 'once' : `${link.views} times`}.`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {state === 'ready' && links && links.length === 0 && (
        <p className="mt-4 text-sm" data-bot="clean-link-none">
          No cleaner link yet.
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          data-bot="clean-link-label"
          placeholder="Cleaner name"
          className="min-w-0 flex-1 rounded-full border border-[var(--uml-line)] bg-transparent px-4 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || state === 'paused'}
          onClick={() => void mint()}
          data-bot="clean-link-mint"
          className="uml-gold-btn rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Make a link'}
        </button>
      </div>
    </section>
  );
}
