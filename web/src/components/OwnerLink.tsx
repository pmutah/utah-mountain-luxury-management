import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * A read-only link for Todd. Minting one does not email it, and the link only opens the Ranch and
 * River statement at `/owner/<token>`. Nothing here changes a booking or an expense.
 */
export function OwnerLink() {
  const [path, setPath] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ path: string; views: number; lastViewedAt: string | null } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'paused'>('loading');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api.getOwnerLinks();
      if (result.storageReads === 'paused' || result.links === null) {
        setState('paused');
        return;
      }
      const last = result.links[result.links.length - 1];
      setSaved(last ? { path: last.path, views: last.views, lastViewedAt: last.lastViewedAt } : null);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    let cancel = false;
    void api
      .getOwnerLinks()
      .then((result) => {
        if (cancel) return;
        if (result.storageReads === 'paused' || result.links === null) {
          setState('paused');
          return;
        }
        const last = result.links[result.links.length - 1];
        setSaved(last ? { path: last.path, views: last.views, lastViewedAt: last.lastViewedAt } : null);
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
    setBusy(true);
    try {
      const created = await api.mintOwnerLink();
      setPath(created.path);
      await load();
      setState('ready');
    } catch {
      setState('error');
    } finally {
      setBusy(false);
    }
  }

  const shown = path ?? saved?.path ?? null;
  const full = shown ? `https://wilhite-portfolio.pages.dev${shown}` : null;

  return (
    <section className="uml-panel mt-6 rounded-3xl p-6" data-bot="owner-link">
      <p className="uml-kicker">Todd’s link</p>
      <p className="mt-2 text-sm text-[var(--uml-muted)]">
        A read-only page for the Ranch and River share. It has no Lindon, household, or construction figures, and it
        cannot change a booking or an expense. Making a link does not send it.
      </p>
      {state === 'paused' && (
        <p className="mt-4 text-sm" data-bot="owner-link-paused">
          The owner links could not be read. This card is not showing an empty list, and nothing was written over them.
        </p>
      )}
      {state === 'error' && (
        <p className="mt-4 text-sm" data-bot="owner-link-error">
          The owner link could not be made just now. Nothing was written.
        </p>
      )}
      {full && (
        <p className="mt-4 break-all text-sm" data-bot="owner-link-url">
          {full}
        </p>
      )}
      {saved && state === 'ready' && (
        <p className="mt-1 text-xs text-[var(--uml-muted)]" data-bot="owner-link-views">
          {saved.views === 0
            ? 'This link has not been opened yet.'
            : `Opened ${saved.views === 1 ? 'once' : `${saved.views} times`}.`}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void mint()}
          disabled={busy || state === 'paused'}
          data-bot="owner-link-mint"
          className="uml-gold-btn rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] disabled:opacity-50"
        >
          {saved ? 'Make another link' : 'Make a link'}
        </button>
        {full && (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(full).then(
                () => setCopied(true),
                () => setCopied(false),
              );
            }}
            data-bot="owner-link-copy"
            className="rounded-full border border-[var(--uml-line)] px-4 py-2 text-xs uppercase tracking-[0.16em]"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </section>
  );
}
