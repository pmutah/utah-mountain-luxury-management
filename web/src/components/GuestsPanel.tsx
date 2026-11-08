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
import { earlyStayOpen, hostAccessPhrase, hostEarlyPhrase } from '../lib/house-stay';
import { hostArrivalPhrase } from '../lib/arrival';
import { hostDeparturePhrase, hostLaterLeavePhrase } from '../lib/departure';
import { checkoutNightIsFree } from '../lib/journey';
import { hostPartyPhrase } from '../lib/note-party';
import { guestAddonIntro, houseMenu, hostAddonPhrase } from '../lib/upsells';
import { loadBookedNights } from '../lib/booked-nights';
import { guestLinkNote, guestListUnreadable, guestListUnreadNote, guestMailUnreadLine } from '../lib/guest-list';
import { denverToday } from '../lib/market/dates';
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
  const [houseFilter, setHouseFilter] = useState<HouseFilter>('all');
  const [houseQuery, setHouseQuery] = useState('');
  const [taken, setTaken] = useState<Record<HouseId, string[]> | null>(null);
  const [listUnreadable, setListUnreadable] = useState(false);
  const today = denverToday();

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
      onToast(e instanceof Error ? e.message : 'Send failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  if (loading && reservations.length === 0) {
    return <p className="text-slate-500 text-sm">Loading stays…</p>;
  }

  return (
    <div className="space-y-6" data-bot="guests">
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
      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5" data-bot="guests-rules">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d4b56a]">House rules</p>
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
          Gmail: {gmail.connected ? gmail.email : 'not connected — sign in as utahmountainluxury@gmail.com'}
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
                  </>
                ) : (
                  <p className="text-xs text-slate-500" data-bot="stay-payout">
                    {formatCurrency(stay.payout)} host net
                  </p>
                )}
              </div>
            </div>

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
