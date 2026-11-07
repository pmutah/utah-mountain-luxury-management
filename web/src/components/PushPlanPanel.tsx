import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Plan = {
  house: string;
  allowed: boolean;
  hold: string | null;
  nights: Array<{ date: string; from: number; to: number; kind: string }>;
  line: string;
  lines: string[];
};

/** A night the host has already approved, so it can be seen and taken back. */
type ApprovedNight = { house: string; date: string; guest: number; approvedAt: string };

type Loaded = {
  plans: Plan[] | null;
  summary: string | null;
  gate: { shadowReady: boolean; hasToken: boolean; paused: boolean; calendarReady: boolean };
  shadowDays: { days: number; required: number; ready: boolean };
  storageReads?: 'ok' | 'paused';
};

const HOUSE: Record<string, string> = { river: 'The River House', ranch: 'The Ranch House', lindon: 'The Lindon House' };

/**
 * What a rate push would change. It is a plan only: this card has no send button because the route
 * behind it has no writer, so nothing here can change a published price.
 *
 * A night can be approved here, and that is the one path by which a comp-driven price reaches a
 * guest. Approving does not push to Airbnb or VRBO: it writes the price this site quotes, and the
 * route refuses a night the calendar has already taken.
 */
export function PushPlanPanel() {
  const [data, setData] = useState<Loaded | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'paused' | 'error'>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * The nights already carrying an approved price. `null` means the sheet could not be read, which
   * is not the same as an empty sheet: an unreadable sheet must not render as "nothing approved".
   */
  const [approved, setApproved] = useState<ApprovedNight[] | null>(null);
  const [approvedLine, setApprovedLine] = useState<string | null>(null);

  function loadApproved() {
    void api
      .getApprovedRates()
      .then((result) => {
        if (result.storageReads === 'paused' || result.approved === null) {
          setApproved(null);
          setApprovedLine('The approved prices could not be read. They are not empty.');
          return;
        }
        setApproved(result.approved);
        setApprovedLine(result.line);
      })
      .catch(() => {
        setApproved(null);
        setApprovedLine('The approved prices could not be read. They are not empty.');
      });
  }

  function load() {
    void api
      .getPushPlan()
      .then((result) => {
        if (result.storageReads === 'paused' || result.plans === null) {
          setState('paused');
          return;
        }
        setData(result);
        setState('ready');
      })
      .catch(() => {
        setState('error');
      });
  }

  useEffect(() => {
    load();
    loadApproved();
  }, []);

  /** Take an approval back, so that night returns to the published card. */
  async function takeBack(house: string, date: string) {
    const key = `${house}|${date}`;
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await api.clearApprovedRate(house, date);
      setNotice(`Took back ${date}. That night is back on the published card.`);
      setApproved((current) =>
        current ? current.filter((row) => !(row.house === house && row.date === date)) : current,
      );
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That night could not be taken back.');
    } finally {
      setBusy(null);
    }
  }

  /** Approve the price the engine proposes for one night, so this site quotes it. */
  async function approve(house: string, date: string, guest: number) {
    const key = `${house}|${date}`;
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      const result = await api.approveRate({ house, date, guest });
      setNotice(`Approved ${guest} for ${date}. That night now quotes this price on our own page.`);
      if (result.dropped > 0) {
        setNotice(
          (line) =>
            `${line} The sheet was full, so ${result.dropped === 1 ? 'the furthest-out night was' : `${result.dropped} furthest-out nights were`} dropped. No night a guest is about to book was touched.`,
        );
      }
      // Drop the approved night from the plan so the same night is not offered twice.
      setData((current) =>
        current
          ? {
              ...current,
              plans:
                current.plans?.map((plan) =>
                  plan.house === house
                    ? { ...plan, nights: plan.nights.filter((night) => night.date !== date) }
                    : plan,
                ) ?? null,
            }
          : current,
      );
      loadApproved();
      if (result.line) setNotice((line) => `${line} ${result.line}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That night could not be approved.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="push-plan">
      <p className="uml-kicker">What a rate push would change</p>
      <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
        A plan, not a send. Booked, closed, paused, locked, and held nights stay put, and a raise never goes under the
        floor. Nothing here changes a rate on Airbnb or VRBO. Approving a night sets the price this site quotes, and
        that night only.
      </p>

      {state === 'paused' && (
        <p className="mt-4 text-sm" data-bot="push-plan-paused">
          The shadow days could not be read, so no plan is shown. Nothing was written.
        </p>
      )}
      {state === 'error' && (
        <p className="mt-4 text-sm" data-bot="push-plan-error">
          The plan could not be read just now. It is not empty. Nothing was written.
        </p>
      )}
      {notice && (
        <p className="mt-4 text-sm" data-bot="push-plan-approved">
          {notice}
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm" data-bot="push-plan-approve-error">
          {error}
        </p>
      )}

      {state === 'ready' && data && (
        <>
          <p className="mt-4 text-sm" data-bot="push-plan-summary">
            {data.summary}
          </p>
          <p className="mt-1 text-xs text-[var(--uml-muted)]" data-bot="push-plan-gate">
            {data.gate.hasToken
              ? 'A write token exists on this deployment.'
              : 'There is no Hospitable write token, so a rate stays closed.'}{' '}
            {data.shadowDays.ready
              ? `Shadow days ${data.shadowDays.days} of ${data.shadowDays.required}.`
              : `Shadow day ${data.shadowDays.days} of ${data.shadowDays.required}.`}
          </p>
          <ul className="mt-4 space-y-3">
            {(data.plans ?? []).map((plan) => (
              <li
                key={plan.house}
                data-bot="push-plan-house"
                data-house={plan.house}
                data-allowed={plan.allowed ? 'yes' : 'no'}
                className="rounded-2xl border border-[var(--uml-line)] p-4"
              >
                <p className="font-display text-xl">{HOUSE[plan.house] ?? plan.house}</p>
                <p className="mt-1 text-sm" data-bot="push-plan-line">
                  {plan.line}
                </p>
                {plan.lines.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-[var(--uml-muted)]">
                    {plan.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
                {plan.nights.length > 0 && (
                  <div className="mt-3 space-y-2" data-bot="push-plan-approve">
                    <p className="text-xs text-[var(--uml-muted)]">
                      Approve a night to quote that price on our own page. It is written on this site only.
                    </p>
                    <ul className="flex flex-wrap gap-2">
                      {plan.nights.slice(0, 14).map((night) => {
                        const key = `${plan.house}|${night.date}`;
                        const verb = night.kind === 'promote' ? 'Promote' : night.kind === 'raise' ? 'Raise' : 'Restore';
                        return (
                          <li key={night.date}>
                            <button
                              type="button"
                              disabled={busy === key}
                              onClick={() => void approve(plan.house, night.date, night.to)}
                              data-bot="push-plan-approve-night"
                              data-date={night.date}
                              className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-xs uppercase tracking-[0.12em] disabled:opacity-50"
                            >
                              {busy === key ? 'Saving…' : `${verb} ${night.date.slice(5)} to ${night.to}`}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-6 border-t border-[var(--uml-line)] pt-4" data-bot="approved-sheet">
        <p className="uml-kicker">Nights already approved</p>
        <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
          These are the prices this site quotes. Every other night uses the published card. Taking one back returns
          that night to the card, and it changes nothing on Airbnb or VRBO.
        </p>
        {approvedLine && (
          <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="approved-sheet-line">
            {approvedLine}
          </p>
        )}
        {approved !== null && approved.length > 0 && (
          <ul className="mt-3 space-y-1">
            {approved.map((night) => {
              const key = `${night.house}|${night.date}`;
              return (
                <li
                  key={key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--uml-line)] px-3 py-1.5 text-xs"
                  data-bot="approved-sheet-night"
                  data-house={night.house}
                  data-date={night.date}
                >
                  <span>
                    {HOUSE[night.house] ?? night.house} · {night.date} · ${night.guest}
                  </span>
                  <button
                    type="button"
                    disabled={busy === key}
                    onClick={() => void takeBack(night.house, night.date)}
                    data-bot="approved-sheet-take-back"
                    className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-[0.65rem] uppercase tracking-[0.12em] disabled:opacity-50"
                  >
                    {busy === key ? 'Working…' : 'Back to card'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
