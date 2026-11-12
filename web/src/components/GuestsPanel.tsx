import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  PROPERTIES,
  formatCurrency,
  type GuestSurveyRecord,
  type Reservation,
} from '../lib/api';
import { GuestStayCard } from './GuestStayCard';
import { GuestDossier } from './GuestDossier';
import { GuestAppEditor } from './GuestAppEditor';
import { GuestTimeline } from './GuestTimeline';
import { StayMessageSender } from './StayMessageSender';
import { GuestLinkBackfill } from './GuestLinkBackfill';
import { RequestInbox } from './RequestInbox';
import { ArrivalReadiness } from './ArrivalReadiness';
import { earlyStayOpen, hostAccessPhrase, hostEarlyPhrase } from '../lib/house-stay';
import { hostArrivalPhrase } from '../lib/arrival';
import { hostDeparturePhrase, hostLaterLeavePhrase } from '../lib/departure';
import { checkoutNightIsFree } from '../lib/journey';
import { hostPartyPhrase } from '../lib/note-party';
import { guestAddonIntro, houseMenu, hostAddonPhrase } from '../lib/upsells';
import { loadBookedNights } from '../lib/booked-nights';
import { guestLinkNote, guestListUnreadable, guestListUnreadNote, guestMailUnreadLine } from '../lib/guest-list';
import { denverToday } from '../lib/market/dates';
import { paymentLedger, outstandingBookings, isDirectSource } from '../lib/payment-ledger';
import type { HouseId } from '../lib/market/types';

type HouseFilter = 'all' | 'ranch' | 'lindon' | 'river';

const HOUSE_FILTERS: Array<{ id: HouseFilter; label: string }> = [
  { id: 'all', label: 'All houses' },
  { id: 'ranch', label: 'Ranch House' },
  { id: 'lindon', label: 'Lindon House' },
  { id: 'river', label: 'River House' },
];

function statusLabel(stay: Reservation, survey?: GuestSurveyRecord) {
  if (survey?.completedAt || stay.surveyCompletedAt) return 'Completed';
  const channel = survey?.channel ?? stay.surveyChannel;
  if ((survey?.sentAt || stay.surveySentAt) && channel === 'none') return 'Link ready';
  if (survey?.sentAt || stay.surveySentAt) return 'Sent';
  if (stay.guestEmail || stay.guestPhone) return 'Ready';
  return 'Need contact';
}

function houseSearchHaystack(stay: Reservation): string {
  const property = PROPERTIES[stay.propertyId];
  const aliases =
    stay.propertyId === 'lindon'
      ? 'lindon house linden house the lindon house'
      : stay.propertyId === 'ranch'
        ? 'ranch house the ranch house'
        : stay.propertyId === 'river'
          ? 'river house riverhouse the river house provo riverhouse'
          : stay.propertyId;
  return [
    stay.guestName,
    stay.guestEmail,
    stay.guestPhone,
    stay.source,
    stay.note,
    stay.confirmationCode,
    stay.propertyId,
    property?.name,
    aliases,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function GuestsPanel({
  onToast,
}: {
  onToast: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [loading, setLoading] = useState(true);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [surveys, setSurveys] = useState<GuestSurveyRecord[]>([]);
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null; problem?: string | null }>({
    connected: false,
    email: null,
  });
  const [sms, setSms] = useState<{ configured: boolean; from: string | null }>({
    configured: false,
    from: null,
  });
  const [drafts, setDrafts] = useState<Record<string, { email: string; phone: string; code: string }>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /**
   * The amount and day typed into a stay's "record a payment" row.
   *
   * Kept per stay so two forms open at once cannot share one figure. `day` starts empty and is filled from
   * `denverToday()` when the row is opened, because a payment is almost always today's — but it stays editable,
   * since a check that arrived last week is normal.
   */
  const [payDrafts, setPayDrafts] = useState<Record<string, { amount: string; day: string }>>({});
  const [houseFilter, setHouseFilter] = useState<HouseFilter>('all');
  const [houseQuery, setHouseQuery] = useState('');
  const [taken, setTaken] = useState<Record<HouseId, string[]> | null>(null);
  const [listUnreadable, setListUnreadable] = useState(false);
  const today = denverToday();

  useEffect(() => {
    const focus = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      if (id) setOpenId(id);
    };
    window.addEventListener('uml:focus-guest', focus);
    return () => window.removeEventListener('uml:focus-guest', focus);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getGuestSurveys();
      if (data.storageReads === 'paused') {
        setListUnreadable(true);
        setReservations([]);
        setSurveys([]);
        return;
      }
      setListUnreadable(false);
      setReservations(data.reservations);
      setSurveys(data.surveys);
      if (data.gmail) setGmail(data.gmail);
      if (data.sms) setSms(data.sms);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const r of data.reservations) {
          if (!next[r.id]) {
            next[r.id] = {
              email: r.guestEmail ?? '',
              phone: r.guestPhone ?? '',
              code: r.confirmationCode ?? '',
            };
          }
        }
        return next;
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not load guests';
      if (guestListUnreadable(message)) {
        setListUnreadable(true);
        setReservations([]);
        setSurveys([]);
        return;
      }
      onToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancel = false;
    loadBookedNights()
      .then((nights) => {
        if (!cancel) setTaken(nights);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  const byId = useMemo(() => {
    const map = new Map(surveys.map((s) => [s.reservationId, s]));
    return map;
  }, [surveys]);

  const visibleStays = useMemo(() => {
    const q = houseQuery.trim().toLowerCase();
    return reservations.filter((stay) => {
      if (houseFilter !== 'all' && stay.propertyId !== houseFilter) return false;
      if (q && !houseSearchHaystack(stay).includes(q)) return false;
      return true;
    });
  }, [reservations, houseFilter, houseQuery]);

  async function saveContacts(stay: Reservation) {
    const draft = drafts[stay.id] ?? { email: '', phone: '', code: '' };
    setBusyId(stay.id);
    try {
      await api.updateReservationContacts(stay.id, {
        guestEmail: draft.email,
        guestPhone: draft.phone,
        confirmationCode: draft.code,
      });
      onToast('Contacts saved', 'success');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function send(stay: Reservation, channel: 'email' | 'sms' | 'none') {
    const draft = drafts[stay.id] ?? { email: '', phone: '', code: stay.confirmationCode ?? '' };
    setBusyId(stay.id);
    try {
      const result = await api.sendGuestSurvey({
        reservationId: stay.id,
        confirmationCode: draft.code || stay.confirmationCode,
        channel,
        guestEmail: draft.email,
        guestPhone: draft.phone,
      });
      if (channel === 'none') {
        try {
          await navigator.clipboard.writeText(result.link);
          onToast(`Link copied · ${result.link}`, 'success');
        } catch {
          onToast(`Link ready · ${result.link}`, 'success');
        }
      } else {
        onToast(`Sent ${channel} · ${result.link}`, 'success');
      }
      await load();
    } catch (e) {
      /*
       * A failed send is not a dead end. The route returns the link it built and the alternatives, so a host whose
       * email is broken can still get the guest their page instead of reading a provider error and stopping.
       */
      const failure = e as { message?: string; link?: string; alternatives?: string };
      const message = e instanceof Error ? e.message : 'Send failed';
      if (failure.link) {
        try {
          await navigator.clipboard.writeText(failure.link);
          onToast(
            `${message} The link is copied — ${failure.alternatives ?? 'send it to the guest yourself.'}`,
            'error',
          );
        } catch {
          onToast(`${message} Link: ${failure.link}`, 'error');
        }
      } else {
        onToast(message, 'error');
      }
    } finally {
      setBusyId(null);
    }
  }

  /**
   * Record money that arrived against one direct booking.
   *
   * The balance was on the card with no way to clear it, so a host could see "$1,500 still owed" and had to
   * reach for curl. This is the control that makes the number actionable.
   *
   * The typed amount is checked here as well as on the route, because a client-side check gives the host the
   * reason immediately and the route check is what actually protects the data. `NaN`, blank, and zero are
   * refused rather than sent on, so a stray tap cannot record a $0 payment that looks like activity.
   */
  async function recordPayment(stay: Reservation) {
    const draft = payDrafts[stay.id] ?? { amount: '', day: denverToday() };
    const typed = draft.amount.trim();
    if (!typed) {
      onToast('Type the amount that arrived.', 'error');
      return;
    }
    const amount = Number(typed.replace(/[$,\s]/g, ''));
    if (!Number.isFinite(amount)) {
      onToast(`"${typed}" is not an amount. Type a number, like 900 or 900.00.`, 'error');
      return;
    }
    if (amount === 0) {
      onToast('A payment of zero records nothing. Leave it blank if nothing arrived.', 'error');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.day.trim())) {
      onToast('Pick the day the money landed.', 'error');
      return;
    }

    setBusyId(stay.id);
    try {
      const result = await api.recordBookingPayment({
        id: stay.id,
        payment: { amount, receivedOn: draft.day.trim() },
      });
      // The route answers with the new balance, so the host sees the effect without a second request.
      onToast(
        result.paidInFull
          ? `Recorded ${formatCurrency(amount)}. That booking is paid in full.`
          : `Recorded ${formatCurrency(amount)}. ${formatCurrency(result.outstanding ?? 0)} still owed.`,
        'success',
      );
      setPayDrafts((d) => ({ ...d, [stay.id]: { amount: '', day: denverToday() } }));
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'The payment could not be recorded', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function removePayment(stay: Reservation, paymentId: string) {
    setBusyId(stay.id);
    try {
      const result = await api.removeBookingPayment(stay.id, paymentId);
      onToast(
        result.outstanding === null
          ? 'Removed.'
          : `Removed. ${formatCurrency(result.outstanding)} still owed.`,
        'success',
      );
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'The payment could not be removed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (loading && reservations.length === 0) {
    return <p className="text-slate-500 text-sm">Loading stays…</p>;
  }

  return (
    <div className="space-y-6" data-bot="guests">
      <ArrivalReadiness reservations={reservations} />
      <GuestDossier reservations={reservations} surveys={surveys} />
      <GuestAppEditor onToast={onToast} locked={listUnreadable} />
      <RequestInbox />
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5" data-bot="guests-upsells">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d4b56a]">Add-ons</p>
        <p className="mt-2 text-sm text-slate-400" data-bot="guests-upsell-note">
          {guestAddonIntro(listUnreadable)}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {(['ranch', 'lindon', 'river'] as const).map((house) => (
            <div key={house}>
              <p className="text-sm text-slate-200">{PROPERTIES[house].name}</p>
              <ul className="mt-2 space-y-2 text-sm text-slate-400">
                {houseMenu(house).map((offer) => (
                  <li key={offer.id}>
                    {offer.name} · ${offer.price}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
      <GuestTimeline
        unreadable={listUnreadable}
        stays={reservations.map((stay) => ({
          propertyId: stay.propertyId,
          checkIn: stay.checkIn,
          checkOut: stay.checkOut,
          status: stay.status,
        }))}
      />
      {/*
        What the portfolio is still owed, from the same ledger the payments route answers with.
        Before this, a direct booking showed what the guest was quoted and nothing said whether it had
        arrived, so "who still owes us" could only be answered by opening the processor by hand.
        A channel booking never appears here: the platform collects and pays out. A direct booking with no
        recorded total is named as such rather than listed at zero.
      */}
      {(() => {
        const owed = outstandingBookings(
          reservations.map((stay) => ({
            id: stay.id,
            source: stay.source,
            guestTotal: stay.guestTotal,
            payments: stay.payments,
            checkIn: stay.checkIn,
            guestName: stay.guestName,
            propertyId: stay.propertyId,
          })),
        );
        const noTotal = owed.skipped.filter((row) => row.reason === 'no guest total');
        if (owed.rows.length === 0 && noTotal.length === 0) return null;
        return (
          <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5" data-bot="guests-owed">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d4b56a]">Still owed</p>
            {owed.rows.length > 0 ? (
              <>
                <p className="mt-2 text-lg font-black text-slate-100" data-bot="guests-owed-total">
                  {formatCurrency(owed.total)} across {owed.rows.length}{' '}
                  {owed.rows.length === 1 ? 'direct booking' : 'direct bookings'}
                </p>
                <ul className="mt-3 space-y-1 text-sm text-slate-300">
                  {owed.rows.map((row) => (
                    <li key={row.id} data-bot="guests-owed-row" data-id={row.id}>
                      {row.guestName} · {row.checkIn} ·{' '}
                      <span className="text-amber-400">{formatCurrency(row.ledger.outstanding ?? 0)} of {formatCurrency(row.ledger.total ?? 0)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-sm text-slate-400">No direct booking is carrying a balance.</p>
            )}
            {noTotal.length > 0 && (
              <p className="mt-3 text-xs text-amber-300" data-bot="guests-owed-unknown">
                {noTotal.length} direct {noTotal.length === 1 ? 'booking has' : 'bookings have'} no guest total, so
                what is owed on {noTotal.length === 1 ? 'it' : 'them'} is unknown. That is not the same as paid.
              </p>
            )}
          </section>
        );
      })()}
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5" data-bot="guests-rules">        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d4b56a]">House rules</p>
        <p className="mt-2 text-sm text-slate-400">
          The door code stays hidden on the guest phone until they tap that they read the house rules. That tap stays on the phone. It does not sign the stay agreement. Checkout steps can be checked off on that same phone, and those checks stay there too.
        </p>
      </section>
      <GuestLinkBackfill />
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-sm text-slate-400">
        {listUnreadable ? (
          <p className="mt-3 text-slate-300" data-bot="guests-mail-unread">
            {guestMailUnreadLine()}
          </p>
        ) : (
          <>
        <p>
          Gmail: {gmail.connected ? gmail.email : 'not connected — connect the guest mailbox'}
        </p>
        {/*
          The reason, not just the state. "not connected" leaves a host guessing, and the two causes need
          opposite fixes: a revoked token means reconnect, a mismatched client secret means the secret must
          be replaced first. Google's own words are shown so the fix is obvious.
        */}
        {!gmail.connected && gmail.problem && (
          <p className="mt-1 text-xs text-amber-300" data-bot="guests-gmail-problem">
            {gmail.problem}
          </p>
        )}
        <p className="mt-1">
          SMS: {sms.configured ? `Twilio ${sms.from}` : 'waiting on Twilio env'}
        </p>
        {!gmail.connected && (
          <button
            type="button"
            className="mt-3 px-4 py-2 rounded-2xl bg-cyan-700 text-white text-[10px] font-black uppercase tracking-widest min-h-[40px]"
            onClick={() => {
              window.location.assign('/api/integrations/gmail/connect');
            }}
          >
            Connect Gmail
          </button>
        )}
          </>
        )}
        <p className="mt-3 text-slate-300" data-bot="guests-link-note">
          {guestLinkNote(listUnreadable)}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {HOUSE_FILTERS.map((house) => {
            const active = houseFilter === house.id;
            return (
              <button
                key={house.id}
                type="button"
                onClick={() => setHouseFilter(house.id)}
                className="uml-nav"
                aria-current={active ? 'page' : undefined}
              >
                {house.label}
              </button>
            );
          })}
        </div>
        <input
          className="w-full rounded-2xl bg-transparent border border-[var(--uml-line)] px-4 py-3 text-sm text-[var(--uml-ink)] placeholder:text-[var(--uml-muted)]"
          placeholder="Search guest, house, or Airbnb code (HMB9PP5E8F)"
          value={houseQuery}
          onChange={(e) => setHouseQuery(e.target.value)}
        />
        {listUnreadable ? (
          <p className="text-sm text-slate-300" data-bot="guests-unreadable">
            {guestListUnreadNote()}
          </p>
        ) : (
          <p className="text-xs text-slate-500">
            {visibleStays.length} stay{visibleStays.length === 1 ? '' : 's'}
            {houseFilter !== 'all' ? ` · ${HOUSE_FILTERS.find((h) => h.id === houseFilter)?.label}` : ''}
          </p>
        )}
      </div>

      {listUnreadable ? null : reservations.length === 0 && (
        <p className="text-slate-500">No upcoming stays.</p>
      )}

      {reservations.length > 0 && visibleStays.length === 0 && (
        <p className="text-slate-500">No stays match that house search.</p>
      )}

      {visibleStays.map((stay) => {
        const survey = byId.get(stay.id);
        const draft = drafts[stay.id] ?? {
          email: stay.guestEmail ?? '',
          phone: stay.guestPhone ?? '',
          code: stay.confirmationCode ?? '',
        };
        const property = PROPERTIES[stay.propertyId]?.name ?? stay.propertyId;
        const open = openId === stay.id;
        return (
          <article key={stay.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4" data-bot="guests-stay">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-white font-black">{stay.guestName}</p>
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  {property} · {stay.checkIn}–{stay.checkOut} · {stay.source}
                  {stay.confirmationCode ? ` · ${stay.confirmationCode}` : ''}
                </p>
                {stay.note && <p className="text-xs text-slate-400 mt-1">{stay.note}</p>}
                <p className="text-xs text-slate-400 mt-1" data-bot="stay-host-party" data-in={stay.checkIn}>
                  {hostPartyPhrase(stay.note)}
                </p>
                <p className="text-xs text-slate-400 mt-1" data-bot="stay-host-arrival" data-in={stay.checkIn}>
                  {hostArrivalPhrase(survey?.answers?.arrivalWindow)}
                </p>
                <p className="text-xs text-slate-400 mt-1" data-bot="stay-host-departure" data-out={stay.checkOut}>
                  {hostDeparturePhrase(survey?.answers?.earlyLate)}
                </p>
                {taken && stay.checkOut >= today && (stay.propertyId === 'ranch' || stay.propertyId === 'lindon' || stay.propertyId === 'river') && (
                  <p className="text-xs text-slate-400 mt-1" data-bot="stay-host-later-leave" data-out={stay.checkOut}>
                    {hostLaterLeavePhrase(checkoutNightIsFree(stay.checkOut, taken[stay.propertyId] ?? []))}
                  </p>
                )}
                {taken && stay.checkIn > today && (stay.propertyId === 'ranch' || stay.propertyId === 'lindon' || stay.propertyId === 'river') && (
                  <p className="text-xs text-slate-400 mt-1" data-bot="stay-host-early" data-in={stay.checkIn}>
                    {hostEarlyPhrase(earlyStayOpen(stay.checkIn, taken[stay.propertyId] ?? [], today))}
                  </p>
                )}
                {stay.propertyId === 'ranch' || stay.propertyId === 'lindon' || stay.propertyId === 'river' ? (
                  <>
                    <p className="text-xs text-slate-400 mt-1" data-bot="stay-host-addons" data-in={stay.checkIn}>
                      {hostAddonPhrase({
                        house: stay.propertyId,
                        checkIn: stay.checkIn,
                        checkOut: stay.checkOut,
                        asOf: today,
                        taken: taken ? (taken[stay.propertyId] ?? []) : null,
                      })}
                    </p>
                    {hostAccessPhrase(stay.checkIn, stay.checkOut, today) && (
                      <p className="text-xs text-slate-400 mt-1" data-bot="stay-host-access" data-in={stay.checkIn}>
                        {hostAccessPhrase(stay.checkIn, stay.checkOut, today)}
                      </p>
                    )}
                  </>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-xs font-black uppercase text-cyan-400">{statusLabel(stay, survey)}</p>
                {/*
                  The payout alone read as a bare figure, so a host could not tell whether it was the
                  guest price or their own cut. Where the guest total was recorded, both are named.
                */}
                {typeof stay.guestTotal === 'number' && stay.guestTotal > 0 ? (
                  <>
                    <p className="text-xs text-slate-500" data-bot="stay-guest-total">
                      Guest {formatCurrency(stay.guestTotal)}
                    </p>
                    <p className="text-xs text-slate-500" data-bot="stay-payout">
                      Keep {formatCurrency(stay.payout)}
                    </p>
                    {/*
                      What the guest was quoted was shown, and nothing said whether it had arrived. On a direct
                      booking that is the one question a host asks, so the balance is stated here — from the same
                      tested ledger the payments route answers with, never from arithmetic written in this file.
                      A channel booking reads `outstanding === null` and this line stays off: the platform pays out.
                    */}
                    {(() => {
                      const ledger = paymentLedger({
                        source: stay.source,
                        guestTotal: stay.guestTotal,
                        payments: stay.payments,
                      });
                      if (ledger.outstanding === null) return null;
                      return (
                        <p
                          className={`text-xs ${ledger.paidInFull ? 'text-emerald-400' : 'text-amber-400'}`}
                          data-bot="stay-balance"
                          data-outstanding={ledger.outstanding}
                        >
                          {ledger.paidInFull
                            ? `Paid in full · ${formatCurrency(ledger.received)} received`
                            : `${formatCurrency(ledger.outstanding)} still owed`}
                        </p>
                      );
                    })()}
                  </>
                ) : (
                  <p className="text-xs text-slate-500" data-bot="stay-payout">
                    {formatCurrency(stay.payout)} host net
                  </p>
                )}
              </div>
            </div>

            {/*
              Recording money, on the booking it applies to.
              Only a direct booking can take one: Airbnb, VRBO, and Hospitable collect from the guest and remit a
              payout, so a form there would invite a host to count the same money twice. The route refuses it too —
              this only keeps the control off a surface where it would be wrong.
            */}
            {isDirectSource(stay.source) && typeof stay.guestTotal === 'number' && stay.guestTotal > 0 && (() => {
              const ledger = paymentLedger({
                source: stay.source,
                guestTotal: stay.guestTotal,
                payments: stay.payments,
              });
              const payDraft = payDrafts[stay.id] ?? { amount: '', day: today };
              return (
                <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-950 p-3" data-bot="stay-payments">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      className="w-28 rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm"
                      placeholder="Amount"
                      inputMode="decimal"
                      data-bot="stay-payment-amount"
                      value={payDraft.amount}
                      onChange={(e) =>
                        setPayDrafts((d) => ({ ...d, [stay.id]: { ...payDraft, amount: e.target.value } }))
                      }
                    />
                    <input
                      type="date"
                      className="rounded-xl bg-slate-900 border border-slate-800 px-3 py-2 text-sm"
                      data-bot="stay-payment-day"
                      value={payDraft.day}
                      onChange={(e) =>
                        setPayDrafts((d) => ({ ...d, [stay.id]: { ...payDraft, day: e.target.value } }))
                      }
                    />
                    <button
                      type="button"
                      data-bot="stay-payment-save"
                      disabled={busyId === stay.id}
                      onClick={() => void recordPayment(stay)}
                      className="px-4 py-2 rounded-xl bg-[#d4b56a] text-slate-950 text-xs font-black uppercase disabled:opacity-40"
                    >
                      Record payment
                    </button>
                    <span className="text-xs text-slate-500" data-bot="stay-payment-line">
                      {ledger.line}
                    </span>
                  </div>
                  {ledger.payments.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-slate-400">
                      {ledger.payments.map((payment) => (
                        <li key={payment.id} className="flex items-center gap-2" data-bot="stay-payment-row">
                          <span className={payment.amount < 0 ? 'text-rose-400' : 'text-emerald-400'}>
                            {formatCurrency(payment.amount)}
                          </span>
                          <span>{payment.receivedOn}</span>
                          {payment.reference && <span className="text-slate-500">{payment.reference}</span>}
                          <button
                            type="button"
                            data-bot="stay-payment-remove"
                            disabled={busyId === stay.id}
                            onClick={() => void removePayment(stay, payment.id)}
                            className="text-slate-500 underline hover:text-slate-300 disabled:opacity-40"
                          >
                            remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            <div className="grid sm:grid-cols-3 gap-3">
              <input
                className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                placeholder="Email"
                value={draft.email}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [stay.id]: { ...draft, email: e.target.value } }))
                }
              />
              <input
                className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                placeholder="Phone"
                value={draft.phone}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [stay.id]: { ...draft, phone: e.target.value } }))
                }
              />
              <input
                className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm"
                placeholder="Airbnb / confirmation code"
                value={draft.code}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [stay.id]: { ...draft, code: e.target.value } }))
                }
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busyId === stay.id}
                onClick={() => void saveContacts(stay)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-black uppercase"
              >
                Save
              </button>
              <button
                type="button"
                data-bot="survey-email"
                disabled={busyId === stay.id || !draft.email}
                onClick={() => void send(stay, 'email')}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase disabled:opacity-40"
              >
                Send email
              </button>
              <button
                type="button"
                data-bot="survey-sms"
                disabled={busyId === stay.id || !draft.phone}
                onClick={() => void send(stay, 'sms')}
                className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black uppercase disabled:opacity-40"
              >
                Send text
              </button>
              <button
                type="button"
                data-bot="survey-copy-link"
                disabled={busyId === stay.id}
                onClick={() => void send(stay, 'none')}
                className="px-4 py-2 rounded-xl bg-cyan-800 text-white text-xs font-black uppercase disabled:opacity-40"
              >
                Copy guest app link
              </button>
              {(survey?.token || stay.surveyToken) && (
                <a
                  data-bot="guest-app-preview"
                  href={`/stay/${encodeURIComponent(survey?.token ?? stay.surveyToken ?? '')}?preview=1`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-xl border border-cyan-800 text-cyan-300 text-xs font-black uppercase"
                >
                  Preview app
                </a>
              )}
              {(survey?.token || stay.surveyToken) && (
                <StayMessageSender
                  token={String(survey?.token ?? stay.surveyToken ?? '')}
                  email={String((stay as { guestEmail?: string }).guestEmail ?? '')}
                />
              )}
              {(survey?.token || stay.surveyToken) && (
                <a
                  data-bot="stay-host-open"
                  href={`/stay/${encodeURIComponent(survey?.token ?? stay.surveyToken ?? '')}/host`}
                  className="px-4 py-2 rounded-xl border border-[#d4b56a]/50 text-[#d4b56a] text-xs font-black uppercase"
                >
                  Guest thread
                </a>
              )}
              <button
                type="button"
                data-bot="survey-answers"
                onClick={() => setOpenId(open ? null : stay.id)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-black uppercase"
              >
                {open ? 'Hide answers' : 'Answers'}
              </button>
            </div>

            {open && (
              <div className="bg-slate-950 rounded-2xl p-4">
                {survey?.answers || stay.propertyId === 'river' ? (
                  <GuestStayCard
                    guestName={stay.guestName}
                    propertyName={property}
                    checkIn={stay.checkIn}
                    checkOut={stay.checkOut}
                    confirmationCode={stay.confirmationCode ?? survey?.confirmationCode}
                    propertyId={stay.propertyId}
                    variant={survey?.variant}
                    answers={survey?.answers ?? {}}
                  />
                ) : (
                  <p className="text-sm text-slate-400">No preference form submitted yet.</p>
                )}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
