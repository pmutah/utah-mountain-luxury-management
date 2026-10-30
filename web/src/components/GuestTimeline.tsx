import { useEffect, useState } from 'react';
import {
  guestTimeline,
  readTimelineSwitches,
  timelineOnCount,
  timelineStorageKey,
  type TimelineId,
} from '../lib/guest-timeline';
import type { HouseId } from '../lib/market/types';
import { PROPERTIES } from '../lib/api';

const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

export function GuestTimeline() {
  const [house, setHouse] = useState<HouseId>('river');
  const [switches, setSwitches] = useState(() => readTimelineSwitches(null));

  useEffect(() => {
    setSwitches(readTimelineSwitches(window.localStorage.getItem(timelineStorageKey())));
  }, []);

  const messages = guestTimeline(house);
  const on = switches[house];

  function toggle(id: TimelineId) {
    const next = {
      ...switches,
      [house]: { ...switches[house], [id]: !switches[house][id] },
    };
    setSwitches(next);
    window.localStorage.setItem(timelineStorageKey(), JSON.stringify(next));
  }

  return (
    <section className="bg-slate-900 border border-slate-800 rounded-3xl p-5" data-bot="guest-timeline" data-house={house}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#d4b56a]">Message timeline</p>
      <p className="mt-2 text-sm text-slate-400">
        These are the messages a stay would receive. Switches stay in this browser. Nothing is sent, and the door code stays off every message.
      </p>
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
      <p className="mt-3 text-xs text-slate-500" data-bot="guest-timeline-count">
        {timelineOnCount(on)} of {messages.length} on for {PROPERTIES[house].name}. Nothing is sent.
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
