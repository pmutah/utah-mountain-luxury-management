import { useEffect, useState } from 'react';

type SwitchRow = { id: string; on: boolean; line: string };
type LockedRow = { id: string; name: string; reason: string };

type SwitchesPayload = {
  ok: boolean;
  reason?: string;
  switches: SwitchRow[];
  locked: LockedRow[];
  sends: false;
  note: string;
};

type FunnelStep = { step: string; visits: number };
type FunnelPayload = {
  stored: boolean;
  reason?: string;
  funnel?: { steps: FunnelStep[]; quotedNotSent: number; requests: number };
  days: number;
  note: string;
};

type AuditPayload = {
  stored: boolean;
  reason?: string;
  lines?: string[];
  code?: string;
  note?: string;
};

type HealthPayload = Record<string, unknown> & { ok?: boolean };

type Read<T> = { kind: 'loading' } | { kind: 'live'; data: T } | { kind: 'off'; reason: string };

async function readJson<T>(url: string): Promise<Read<T>> {
  try {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string; reason?: string };
      return { kind: 'off', reason: body.reason ?? body.error ?? `the server answered ${res.status}` };
    }
    return { kind: 'live', data: (await res.json()) as T };
  } catch (err) {
    return { kind: 'off', reason: err instanceof Error ? err.message : 'the read failed' };
  }
}

/**
 * The platform panel: what the funnel did, what changed, what the switches are set to, and whether the bindings are there.
 *
 * All four routes have existed since the spine landed and **nothing read any of them** — a host had to know the URL and hold the
 * cookie to see his own funnel counts. They sit on the Agents page because that is where a host goes to change how the platform
 * behaves, and each one distinguishes "nothing has happened" from "the read failed", which is the distinction that matters on a
 * panel showing zeroes.
 */
export function PlatformPanel() {
  const [switches, setSwitches] = useState<Read<SwitchesPayload>>({ kind: 'loading' });
  const [funnel7, setFunnel7] = useState<Read<FunnelPayload>>({ kind: 'loading' });
  const [funnel30, setFunnel30] = useState<Read<FunnelPayload>>({ kind: 'loading' });
  const [audit, setAudit] = useState<Read<AuditPayload>>({ kind: 'loading' });
  const [health, setHealth] = useState<Read<HealthPayload>>({ kind: 'loading' });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    void readJson<SwitchesPayload>('/api/platform/switches').then((result) => {
      if (!cancel) setSwitches(result);
    });
    void readJson<FunnelPayload>('/api/platform/funnel?window=7').then((result) => {
      if (!cancel) setFunnel7(result);
    });
    void readJson<FunnelPayload>('/api/platform/funnel?window=30').then((result) => {
      if (!cancel) setFunnel30(result);
    });
    void readJson<AuditPayload>('/api/platform/audit?limit=25').then((result) => {
      if (!cancel) setAudit(result);
    });
    void readJson<HealthPayload>('/api/platform/health').then((result) => {
      if (!cancel) setHealth(result);
    });
    return () => {
      cancel = true;
    };
  }, []);

  const toggle = async (id: string, on: boolean) => {
    setBusy(id);
    setNotice(null);
    try {
      const res = await fetch('/api/platform/switches', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, on }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; line?: string };
      if (!res.ok) {
        setNotice(body.error ?? `The switch was refused (${res.status}).`);
        return;
      }
      setNotice(body.line ?? 'Saved.');
      const refreshed = await readJson<SwitchesPayload>('/api/platform/switches');
      setSwitches(refreshed);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'The switch could not be changed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="uml-panel rounded-3xl p-6" data-bot="platform-panel">
      <p className="uml-kicker">Platform</p>
      <h3 className="mt-1 font-display text-3xl">What it is doing</h3>

      {/* The switches. Only the three the server accepts are drawn as controls. */}
      <div className="mt-4" data-bot="platform-switches" data-state={switches.kind}>
        <p className="text-xs uppercase tracking-widest text-[var(--uml-muted)]">Switches</p>
        {switches.kind === 'loading' && <p className="mt-2 text-sm text-[var(--uml-muted)]">Reading the switches…</p>}
        {switches.kind === 'off' && (
          <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="platform-switches-off">
            The switches could not be read from this server, so nothing here can be changed. That does not mean they are off.
          </p>
        )}
        {switches.kind === 'live' && (
          <>
            {!switches.data.ok && switches.data.reason && (
              <p className="mt-2 text-sm text-rose-100" data-bot="platform-switches-unreadable">
                {switches.data.reason} Every switch is treated as off until the store can be read.
              </p>
            )}
            <ul className="mt-2 space-y-2 text-sm">
              {switches.data.switches.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2" data-bot={`platform-switch-${row.id}`}>
                  <span>
                    <span className="text-[var(--uml-gold)]">{row.id}.</span> {row.line}
                  </span>
                  <button
                    type="button"
                    data-bot={`platform-switch-toggle-${row.id}`}
                    data-on={row.on ? 'yes' : 'no'}
                    disabled={busy === row.id}
                    onClick={() => void toggle(row.id, !row.on)}
                    className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
                  >
                    {busy === row.id ? 'Saving…' : row.on ? 'Turn off' : 'Turn on'}
                  </button>
                </li>
              ))}
            </ul>
            <ul className="mt-3 space-y-1 text-xs text-[var(--uml-muted)]" data-bot="platform-switches-locked">
              {switches.data.locked.map((row) => (
                <li key={row.id} data-bot={`platform-locked-${row.id}`}>
                  <span className="font-bold">{row.name} is locked.</span> {row.reason}
                </li>
              ))}
            </ul>
            {notice && (
              <p className="mt-2 text-xs text-[var(--uml-gold)]" data-bot="platform-switch-notice">
                {notice}
              </p>
            )}
          </>
        )}
      </div>

      {/* The funnel. 7 and 30 days, by visit, with the quote that never became a request. */}
      <div className="mt-6" data-bot="platform-funnel">
        <p className="text-xs uppercase tracking-widest text-[var(--uml-muted)]">Booking funnel</p>
        {([7, 30] as const).map((days) => {
          const state = days === 7 ? funnel7 : funnel30;
          if (state.kind === 'loading') {
            return (
              <p key={days} className="mt-2 text-sm text-[var(--uml-muted)]">
                Reading the {days}-day funnel…
              </p>
            );
          }
          if (state.kind === 'off' || !state.data.stored) {
            return (
              <p key={days} className="mt-2 text-sm text-[var(--uml-muted)]" data-bot={`platform-funnel-${days}-off`}>
                The {days}-day funnel could not be read from this server. This is not a zero.
              </p>
            );
          }
          const funnel = state.data.funnel;
          if (!funnel) return null;
          return (
            <p key={days} className="mt-1 text-sm" data-bot={`platform-funnel-${days}`}>
              <span className="text-[var(--uml-gold)]">{days} days.</span>{' '}
              {funnel.steps.map((step) => `${step.step} ${step.visits}`).join(' · ')}. {funnel.quotedNotSent} picked dates and never
              sent · {funnel.requests} sent.
            </p>
          );
        })}
        <p className="mt-1 text-xs text-[var(--uml-muted)]">
          Counted by visit, not by row, so a reload is not a second guest. No address, name, phone, or device is stored.
        </p>
      </div>

      {/* The audit log. Admin only, so an owner account is told why it is empty rather than shown a blank list. */}
      <div className="mt-6" data-bot="platform-audit">
        <p className="text-xs uppercase tracking-widest text-[var(--uml-muted)]">Recent changes</p>
        {audit.kind === 'loading' && <p className="mt-2 text-sm text-[var(--uml-muted)]">Reading the log…</p>}
        {audit.kind === 'off' && (
          <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="platform-audit-off">
            The log could not be read from this server. This does not mean nothing changed.
          </p>
        )}
        {audit.kind === 'live' && !audit.data.stored && (
          <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="platform-audit-empty">
            {audit.data.reason ?? 'The log could not be read. This does not mean nothing changed.'}
          </p>
        )}
        {audit.kind === 'live' && audit.data.stored && (
          <ul className="mt-2 space-y-1 text-sm" data-bot="platform-audit-lines">
            {(audit.data.lines ?? []).length === 0 ? (
              <li className="text-[var(--uml-muted)]">No change has been recorded yet.</li>
            ) : (
              (audit.data.lines ?? []).map((line) => <li key={line}>{line}</li>)
            )}
          </ul>
        )}
        <p className="mt-1 text-xs text-[var(--uml-muted)]">
          Who changed what, and when. No amount, guest name, phone, or receipt body is recorded.
        </p>
      </div>

      {/* Bindings. Names only, never a value. */}
      <div className="mt-6" data-bot="platform-health">
        <p className="text-xs uppercase tracking-widest text-[var(--uml-muted)]">Bindings and keys</p>
        {health.kind === 'loading' && <p className="mt-2 text-sm text-[var(--uml-muted)]">Reading…</p>}
        {health.kind === 'off' && (
          <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="platform-health-off">
            Health could not be read from this server.
          </p>
        )}
        {health.kind === 'live' && (
          <p className="mt-1 text-sm" data-bot="platform-health-line">
            KV {String(health.data.kv)} · reads {String(health.data.kvReads)} · D1 {String(health.data.d1)} · D1 read{' '}
            {String(health.data.d1Read)} · R2 {String(health.data.r2)}. Keys present:{' '}
            {Object.entries((health.data.keys as Record<string, boolean> | undefined) ?? {})
              .filter(([, on]) => on)
              .map(([name]) => name)
              .join(', ') || 'none'}
            .
          </p>
        )}
      </div>
    </div>
  );
}
