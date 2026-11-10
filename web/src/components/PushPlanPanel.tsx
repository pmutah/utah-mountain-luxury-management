import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { AIRBNB_KEEP } from '../lib/revenue-goals';

type Plan = {
  house: string;
  allowed: boolean;
  /** What `allowed` means: clear to act on by hand. Never "a rate can be sent". */
  actionable?: boolean;
  /** False on every response, because no sender exists. */
  sends?: boolean;
  hold: string | null;
  nights: Array<{ date: string; from: number; to: number; kind: string; source?: string }>;
  line: string;
  lines: string[];
  /** Lines priced off a live ask, and lines priced off the invented sample set, counted separately. */
  liveLines?: number;
  sampleLines?: number;
  sampleNote?: string | null;
  /** How far the plan still is from the market at the 8% daily cap. Null when it is not behind. */
  climb?: string | null;
};

/** A night the host has already approved, so it can be seen and taken back. */
type ApprovedNight = { house: string; date: string; guest: number; approvedAt: string };

/** The publishing switch as the route reports it. `null` means it could not be read. */
type SwitchState = {
  switch: 'on' | 'off';
  line: string;
  hasToken: boolean;
  unit: 'cents' | 'dollars' | null;
  properties: string;
  promotionNote: string;
};

type PublishResult = {
  ok: boolean;
  sent: Array<{ listing: string; dates: number; batches: number }>;
  refused: Array<{ listing: string; date?: string; why: string }>;
  line: string;
  switch: 'on' | 'off';
};

type Loaded = {
  plans: Plan[] | null;
  summary: string | null;
  gate: {
    shadowReady: boolean;
    hasToken: boolean;
    paused: boolean;
    calendarReady: boolean;
    /** Whether a rate could leave this app at all. False both with and without a token today. */
    send?: { sends: boolean; line: string };
  };
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
   * Whether the last copy worked. A copy button that fails without saying so is worse than no button: the host
   * would paste whatever was already on the clipboard into a live listing. `navigator.clipboard` needs a secure
   * context and a user gesture, neither of which this code can guarantee, so the outcome is reported.
   */
  const [copied, setCopied] = useState<'ok' | 'failed' | null>(null);
  /**
   * The nights already carrying an approved price. `null` means the sheet could not be read, which
   * is not the same as an empty sheet: an unreadable sheet must not render as "nothing approved".
   */
  const [approved, setApproved] = useState<ApprovedNight[] | null>(null);
  const [approvedLine, setApprovedLine] = useState<string | null>(null);
  /**
   * The publishing switch. `null` is "could not be read", which is not "off": a host must not read a failed
   * read as the switch being safely closed.
   */
  const [pub, setPub] = useState<SwitchState | null>(null);
  const [pubUnread, setPubUnread] = useState(false);
  /** The last publish attempt's outcome, kept so a refusal stays on screen rather than flashing past. */
  const [published, setPublished] = useState<PublishResult | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function loadSwitch() {
    void api
      .getPublishSwitch()
      .then((result) => {
        setPub(result);
        setPubUnread(false);
      })
      .catch(() => {
        setPub(null);
        setPubUnread(true);
      });
  }

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
    loadSwitch();
  }, []);

  /**
   * Send the approved prices.
   *
   * This is the one action in the app that can move a price off this site, so it takes a second click. The
   * route refuses while the switch is off, and the refusal is shown as-is rather than as "nothing sent" —
   * the reason is which condition is missing, and that is what the host would have to change.
   */
  async function publish() {
    setPublishing(true);
    setError(null);
    setNotice(null);
    setPublished(null);
    try {
      const result = await api.publishRates();
      setPublished(result);
    } catch (err) {
      /*
       * A 409 from the switch is an expected answer, not a crash: `request` throws on a non-2xx, so the
       * message carries the route's own sentence. Show it rather than inventing one.
       */
      setError(err instanceof Error ? err.message : 'Nothing was published.');
    } finally {
      setPublishing(false);
      setConfirming(false);
    }
  }

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
      setNotice(
        `Approved ${guest} for ${date}. That is the Airbnb price for that night; our own page quotes the host net, ${Math.round(guest * AIRBNB_KEEP)}, so a direct guest saves the platform fee.`,
      );
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

  /**
   * Approve every night this house's plan proposes, in one write.
   *
   * The 8% cap means a house at the bottom of its band needs many days of approvals, and doing them one at a
   * time is what makes a host stop halfway — a seven-night plan climbing for two weeks was about a hundred
   * clicks. Each night is still checked on its own; the response counts the refusals and names them.
   */
  async function approveAll(house: string, nights: Array<{ date: string; to: number; source?: string }>) {
    const usable = nights.filter((night) => night.source !== 'sample');
    if (usable.length === 0) {
      setError('Every night in this plan is priced off the sample set, so none can be approved.');
      return;
    }
    setBusy(`${house}|all`);
    setError(null);
    setNotice(null);
    try {
      const result = await api.approveRateBatch({
        house,
        nights: usable.map((night) => ({ date: night.date, guest: night.to })),
      });
      setNotice(result.line);
      if (result.refused > 0) {
        const first = result.nights.find((night) => !night.ok);
        if (first) setError(`${first.date}: ${first.reason ?? 'refused'}`);
      }
      load();
      loadApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Those nights could not be approved.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="push-plan">
      <p className="uml-kicker">What a rate push would change</p>
      <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
        A plan, not a send. Booked, closed, paused, locked, and held nights stay put, and a raise never goes under the
        floor. Building the plan changes nothing on Airbnb or VRBO: <strong>type the listed price into the site
        yourself</strong>, or turn on publishing at the bottom of this card to send approved nights to the calendar.
        A night whose only comps are the invented sample set shows no price to type, because there is no measurement
        behind it. Approving a night sets the price this site quotes, and that night only.
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
            {/*
              The old text said "A write token exists on this deployment" once the env var was set, which a
              host reads as *it will now push*. It would not: `HOSPITABLE_WRITE_TOKEN` is only ever read to
              compute this boolean, and there is no Hospitable client or outbound price call in the code.
              The sentence now comes from `pushSendState`, so the page cannot claim a send the code lacks.
            */}
            {data.gate.send?.line ?? 'A rate would not leave this app: no sender is built yet.'}{' '}
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
                /*
                 * A second attribute for the part that is true. `data-allowed="yes"` on a build with no sender told a
                 * bot the rate could be pushed; this one says the plan is clear to act on by hand, and
                 * `data-sends` says nothing leaves the app.
                 */
                data-actionable={plan.actionable ? 'yes' : 'no'}
                data-sends="no"
                className="rounded-2xl border border-[var(--uml-line)] p-4"
              >
                <p className="font-display text-xl">{HOUSE[plan.house] ?? plan.house}</p>
                <p className="mt-1 text-sm" data-bot="push-plan-line">
                  {plan.line}
                </p>
                {/*
                  The climb sits directly under the headline, before the night list, because the list is what a
                  host would act on. "7 nights would change" beside a house at the bottom of its market reads as
                  a repricing; this says how many more days the cap requires.
                */}
                {plan.climb && (
                  <p className="mt-1 text-sm" data-bot={`push-plan-climb-${plan.house}`}>
                    {plan.climb}
                  </p>
                )}
                {plan.lines.length > 0 && (
                  <div className="mt-2">
                    {/*
                      The provenance note sits **above** the button, because the button is an instruction to paste
                      these numbers into a live listing. A line priced off `fixtures.ts` is arithmetic on numbers
                      this repo invented, so it carries no figure to type and this note says why.
                    */}
                    {plan.sampleNote && (
                      <p
                        className="mb-2 rounded-xl border border-[var(--uml-line)] px-3 py-2 text-xs text-[var(--uml-muted)]"
                        data-bot={`push-plan-source-${plan.house}`}
                        data-sample-lines={plan.sampleLines ?? 0}
                        data-live-lines={plan.liveLines ?? 0}
                      >
                        {plan.sampleNote}
                      </p>
                    )}
                    {/*
                      A copy button, because the plan only reaches Airbnb when a person types it in. Without one the
                      host retypes thirty prices by hand; with one the whole house can be pasted into a note or a
                      message to whoever is doing the typing. It copies the same lines the list shows.
                    */}
                    <button
                      type="button"
                      data-bot={`push-plan-copy-${plan.house}`}
                      onClick={() => {
                        const text = plan.lines.join('\n');
                        setCopied(null);
                        navigator.clipboard
                          ?.writeText(text)
                          .then(() => setCopied('ok'))
                          .catch(() => setCopied('failed'));
                        if (!navigator.clipboard) setCopied('failed');
                      }}
                      className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-[11px] uppercase tracking-[0.12em]"
                    >
                      Copy these prices
                    </button>
                    {copied === 'ok' && (
                      <span className="ml-2 text-[11px]" data-bot="push-plan-copied">
                        Copied {plan.lines.length} {plan.lines.length === 1 ? 'night' : 'nights'}.
                      </span>
                    )}
                    {copied === 'failed' && (
                      <span className="ml-2 text-[11px]" data-bot="push-plan-copy-failed">
                        Copying was blocked. Select the lines below and copy them by hand.
                      </span>
                    )}
                    <ul className="mt-2 space-y-0.5 text-xs text-[var(--uml-muted)]">
                      {plan.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {plan.nights.length > 0 && (
                  <div className="mt-3 space-y-2" data-bot="push-plan-approve">
                    <p className="text-xs text-[var(--uml-muted)]">
                      Approve a night to set that Airbnb price. Our own page quotes the host net, so a direct guest
                      saves the platform fee. It is written on this site only.
                      {/*
                        An approve button on a sample-priced night would write a fabricated rate onto our real
                        booking page — the one place these numbers actually reach a guest. The typed price is the
                        danger; this button is the delivery mechanism, so the sample nights are not offered here.
                      */}
                      {(plan.sampleLines ?? 0) > 0 && (
                        <span data-bot={`push-plan-approve-note-${plan.house}`}>
                          {' '}
                          Nights priced only off the sample set are not offered here, because approving one would put
                          an invented rate on the booking page.
                        </span>
                      )}
                    </p>
                    {/*
                      One button for the whole plan. The 8% cap needs one approval per night per day, so a house
                      at the bottom of its band needs dozens — and doing them one at a time is where a host gives
                      up. A single night keeps its own button below for the case where the host wants just one.
                    */}
                    {plan.nights.filter((night) => night.source !== 'sample').length > 1 && (
                      <button
                        type="button"
                        disabled={busy === `${plan.house}|all`}
                        onClick={() => void approveAll(plan.house, plan.nights)}
                        data-bot={`push-plan-approve-all-${plan.house}`}
                        className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-xs uppercase tracking-[0.12em] disabled:opacity-50"
                      >
                        {busy === `${plan.house}|all`
                          ? 'Saving…'
                          : `Approve all ${plan.nights.filter((night) => night.source !== 'sample').length} nights`}
                      </button>
                    )}
                    <ul className="flex flex-wrap gap-2">
                      {plan.nights
                        .filter((night) => night.source !== 'sample')
                        .slice(0, 14)
                        .map((night) => {
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
                                data-source={night.source}
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

      {/*
        The publishing switch, and the one button that can move a price off this site.

        It sits below the approved sheet because approving is the step before it: the sender only ever
        uploads the host's own approved numbers. The switch is owned by two deployment variables the host
        sets, so this panel reports their state and cannot turn them on itself — that is deliberate, and the
        text says so instead of offering a toggle that would not do anything.
      */}
      <div className="mt-6 border-t border-[var(--uml-line)] pt-4" data-bot="publish-switch">
        <p className="uml-kicker">Publishing to Airbnb and VRBO</p>
        {pubUnread && (
          <p className="mt-2 text-sm" data-bot="publish-unread">
            The publishing switch could not be read. That is not the same as off — treat rates as unpublishable until
            this reads.
          </p>
        )}
        {pub && (
          <>
            <p
              className="mt-2 max-w-2xl text-sm"
              data-bot="publish-state"
              data-switch={pub.switch}
              data-unit={pub.unit ?? 'unset'}
            >
              {pub.line}
            </p>
            <p className="mt-1 max-w-2xl text-xs text-[var(--uml-muted)]" data-bot="publish-properties">
              {pub.properties}
            </p>
            <p className="mt-1 max-w-2xl text-xs text-[var(--uml-muted)]" data-bot="publish-promotion-note">
              {pub.promotionNote}
            </p>
            {pub.switch === 'off' ? (
              <p className="mt-2 max-w-2xl text-xs text-[var(--uml-muted)]" data-bot="publish-how">
                The switch is two deployment settings, not a button here — <code>HOSPITABLE_RATE_PUSH=on</code> and{' '}
                <code>HOSPITABLE_PRICE_UNIT</code> set to <code>cents</code> or <code>dollars</code>. Both are off today,
                so nothing below can send.
              </p>
            ) : (
              <div className="mt-3 space-y-2" data-bot="publish-action">
                {!confirming ? (
                  <button
                    type="button"
                    data-bot="publish-ask"
                    onClick={() => setConfirming(true)}
                    className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-xs uppercase tracking-[0.12em]"
                  >
                    Publish {approved?.length ?? 0} approved {approved?.length === 1 ? 'night' : 'nights'}
                  </button>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {/*
                      The second click names the count. A single button that writes to a live listing is the
                      shape that produces an accidental send, and this is the highest-consequence write in the app.
                    */}
                    <button
                      type="button"
                      disabled={publishing}
                      data-bot="publish-confirm"
                      onClick={() => void publish()}
                      className="uml-gold-btn rounded-full px-3 py-1 text-xs uppercase tracking-[0.12em] disabled:opacity-50"
                    >
                      {publishing ? 'Publishing…' : `Yes, send ${approved?.length ?? 0} to the calendar`}
                    </button>
                    <button
                      type="button"
                      disabled={publishing}
                      data-bot="publish-cancel"
                      onClick={() => setConfirming(false)}
                      className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-xs uppercase tracking-[0.12em] disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
            {published && (
              <div className="mt-3 text-sm" data-bot="publish-result" data-ok={published.ok ? 'yes' : 'no'}>
                <p>{published.line}</p>
                {published.sent.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs text-[var(--uml-muted)]">
                    {published.sent.map((row) => (
                      <li key={row.listing} data-bot="publish-sent-row">
                        {row.listing}: {row.dates} {row.dates === 1 ? 'night' : 'nights'} in {row.batches}{' '}
                        {row.batches === 1 ? 'batch' : 'batches'}
                      </li>
                    ))}
                  </ul>
                )}
                {/*
                  A refused night is named one by one. "Some nights did not send" is not actionable; the
                  house and the reason are what a host can fix.
                */}
                {published.refused.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-xs" data-bot="publish-refused">
                    {published.refused.slice(0, 10).map((row, index) => (
                      <li key={`${row.listing}|${row.date ?? index}`}>
                        {row.listing}
                        {row.date ? ` · ${row.date}` : ''}: {row.why}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
