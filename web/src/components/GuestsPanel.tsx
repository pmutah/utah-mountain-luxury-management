import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  PROPERTIES,
  formatCurrency,
  type GuestSurveyRecord,
  type Reservation,
} from '../lib/api';

type HouseFilter = 'all' | 'ranch' | 'lindon' | 'river';

const HOUSE_FILTERS: Array<{ id: HouseFilter; label: string; activeClass: string }> = [
  { id: 'all', label: 'All houses', activeClass: 'bg-teal-600 text-white shadow-xl' },
  { id: 'ranch', label: 'Ranch House', activeClass: 'bg-blue-600 text-white shadow-xl' },
  { id: 'lindon', label: 'Lindon House', activeClass: 'bg-emerald-600 text-white shadow-xl' },
  { id: 'river', label: 'River House', activeClass: 'bg-cyan-600 text-white shadow-xl' },
];

function statusLabel(stay: Reservation, survey?: GuestSurveyRecord) {
  if (survey?.completedAt) return 'Completed';
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
  const [gmail, setGmail] = useState<{ connected: boolean; email: string | null }>({
    connected: false,
    email: null,
  });
  const [sms, setSms] = useState<{ configured: boolean; from: string | null }>({
    configured: false,
    from: null,
  });
  const [drafts, setDrafts] = useState<Record<string, { email: string; phone: string }>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [houseFilter, setHouseFilter] = useState<HouseFilter>('all');
  const [houseQuery, setHouseQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getGuestSurveys();
      setReservations(data.reservations);
      setSurveys(data.surveys);
      setGmail(data.gmail);
      setSms(data.sms);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const r of data.reservations) {
          if (!next[r.id]) {
            next[r.id] = { email: r.guestEmail ?? '', phone: r.guestPhone ?? '' };
          }
        }
        return next;
      });
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Could not load guests', 'error');
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load]);

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
    const draft = drafts[stay.id] ?? { email: '', phone: '' };
    setBusyId(stay.id);
    try {
      await api.updateReservationContacts(stay.id, {
        guestEmail: draft.email,
        guestPhone: draft.phone,
      });
      onToast('Contacts saved', 'success');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function send(stay: Reservation, channel: 'email' | 'sms') {
    const draft = drafts[stay.id] ?? { email: '', phone: '' };
    setBusyId(stay.id);
    try {
      const result = await api.sendGuestSurvey({
        reservationId: stay.id,
        channel,
        guestEmail: draft.email,
        guestPhone: draft.phone,
      });
      onToast(`Sent ${channel} · ${result.link}`, 'success');
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
    <div className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 text-sm text-slate-400">
        <p>
          Gmail: {gmail.connected ? gmail.email : 'not connected — sign in as utahmountainluxury@gmail.com'}
        </p>
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
                className={`px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-widest min-h-[44px] ${
                  active ? house.activeClass : 'bg-slate-900 text-slate-500 border border-slate-800'
                }`}
              >
                {house.label}
              </button>
            );
          })}
        </div>
        <input
          className="w-full rounded-2xl bg-slate-900 border border-slate-800 px-4 py-3 text-sm text-white placeholder:text-slate-500"
          placeholder="Search Lindon House, Ranch House, River House, or guest name"
          value={houseQuery}
          onChange={(e) => setHouseQuery(e.target.value)}
        />
        <p className="text-xs text-slate-500">
          {visibleStays.length} stay{visibleStays.length === 1 ? '' : 's'}
          {houseFilter !== 'all' ? ` · ${HOUSE_FILTERS.find((h) => h.id === houseFilter)?.label}` : ''}
        </p>
      </div>

      {reservations.length === 0 && (
        <p className="text-slate-500">No upcoming stays.</p>
      )}

      {reservations.length > 0 && visibleStays.length === 0 && (
        <p className="text-slate-500">No stays match that house search.</p>
      )}

      {visibleStays.map((stay) => {
        const survey = byId.get(stay.id);
        const draft = drafts[stay.id] ?? { email: stay.guestEmail ?? '', phone: stay.guestPhone ?? '' };
        const property = PROPERTIES[stay.propertyId]?.name ?? stay.propertyId;
        const open = openId === stay.id;
        return (
          <article key={stay.id} className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <p className="text-white font-black">{stay.guestName}</p>
                <p className="text-xs uppercase tracking-widest text-slate-500">
                  {property} · {stay.checkIn}–{stay.checkOut} · {stay.source}
                </p>
                {stay.note && <p className="text-xs text-slate-400 mt-1">{stay.note}</p>}
              </div>
              <div className="text-right">
                <p className="text-xs font-black uppercase text-cyan-400">{statusLabel(stay, survey)}</p>
                <p className="text-xs text-slate-500">{formatCurrency(stay.payout)}</p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
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
                disabled={busyId === stay.id || !draft.email}
                onClick={() => void send(stay, 'email')}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-black uppercase disabled:opacity-40"
              >
                Send email
              </button>
              <button
                type="button"
                disabled={busyId === stay.id || !draft.phone}
                onClick={() => void send(stay, 'sms')}
                className="px-4 py-2 rounded-xl bg-emerald-700 text-white text-xs font-black uppercase disabled:opacity-40"
              >
                Send text
              </button>
              <button
                type="button"
                onClick={() => setOpenId(open ? null : stay.id)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-xs font-black uppercase"
              >
                {open ? 'Hide answers' : 'Answers'}
              </button>
            </div>

            {open && (
              <div className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-950 rounded-2xl p-4">
                {survey?.answers
                  ? Object.entries(survey.answers)
                      .filter(([, v]) => (Array.isArray(v) ? v.length : String(v ?? '').trim()))
                      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
                      .join('\n')
                  : 'No preference form submitted yet.'}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
