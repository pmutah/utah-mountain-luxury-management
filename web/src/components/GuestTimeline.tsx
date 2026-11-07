import { useEffect, useState } from 'react';
import {
  guestTimeline,
  readTimelineSwitches,
  timelineUnreadLine,
  timelineOnCount,
  timelineStayFor,
  timelineStayLabel,
  timelineStorageKey,
  type TimelineId,
  type TimelineStay,
} from '../lib/guest-timeline';
import { stayMoment } from '../lib/journey';
import { denverToday } from '../lib/market/dates';
import type { HouseId } from '../lib/market/types';
import { PROPERTIES } from '../lib/api';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

export function GuestTimeline({ stays = [], unreadable = false }: { stays?: readonly TimelineStay[]; unreadable?: boolean }) {
  const [house, setHouse] = useState<HouseId>('river');
  const [switches, setSwitches] = useState(() => readTimelineSwitches(null));

  useEffect(() => {
    setSwitches(readTimelineSwitches(window.localStorage.getItem(timelineStorageKey())));
  }, []);

  const today = denverToday();
  const picked = unreadable ? null : timelineStayFor(house, stays, today);
  const messages = guestTimeline(house, picked, unreadable ? 'quote' : 'stay');
  const on = switches[house];
  const pickedLabel = picked ? timelineStayLabel(picked.checkIn, picked.checkOut) : '';

  function toggle(id: TimelineId) {
    const next = {
      ...switches,
      [house]: { ...switches[house], [id]: !switches[house][id] },
    };
    setSwitches(next);
    window.localStorage.setItem(timelineStorageKey(), JSON.stringify(next));
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5" data-bot="guest-timeline" data-house={house} data-audience={unreadable ? 'quote' : 'stay'}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d4b56a]">Message timeline</p>
      <p className="mt-2 text-sm text-slate-400">
        The messages a stay receives, and when each is due. The switches stay in this browser and mark
        what this desk intends to send; they do not stop the sender on a stay card below. Nothing here
        sends on its own, and the door code stays off every message.
      </p>
      {unreadable && (
        <p className="mt-2 text-sm text-slate-300" data-bot="guest-timeline-unread">
          {timelineUnreadLine()}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {HOUSES.map((id) => (
          <button
            key={id}
            type="button"
            className={`rounded-full border border-slate-700 px-4 py-2 text-sm ${house === id ? 'text-white' : 'text-slate-400'}`}
            data-bot={`guest-timeline-${id}`}
            aria-pressed={house === id}
            onClick={() => setHouse(id)}
          >
            {PROPERTIES[id].name}
          </button>
        ))}
      </div>
      {pickedLabel && picked && (
        <p className="mt-3 text-sm text-slate-300" data-bot="guest-timeline-stay">
          This preview is for the stay from {pickedLabel}. Names stay off, and this panel sends nothing. {stayMoment(today, picked.checkIn, picked.checkOut)}
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500" data-bot="guest-timeline-count">
        {timelineOnCount(on)} of {messages.length} on for {PROPERTIES[house].name}. A message is sent by hand from that stay's card, one at a time.
      </p>
      <ul className="mt-4 space-y-4">
        {messages.map((message) => (
          <li key={message.id} data-bot="guest-timeline-message" data-message={message.id} data-on={on[message.id] ? 'yes' : 'no'}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">{message.when}</p>
                <p className="text-sm text-slate-200">{message.subject}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-slate-700 px-3 py-1 text-xs"
                data-bot={`guest-timeline-toggle-${message.id}`}
                aria-pressed={on[message.id]}
                onClick={() => toggle(message.id)}
              >
                {on[message.id] ? 'On' : 'Off'}
              </button>
            </div>
            {on[message.id] && <p className="mt-2 text-sm text-slate-400">{message.body}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
