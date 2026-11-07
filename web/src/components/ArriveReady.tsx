import { useState } from 'react';
import { arriveReady, arriveReadyNote, readArriveChecks, writeArriveChecks, type ArriveWhere } from '../lib/arrive-ready';
import type { HouseId } from '../lib/market/types';

const ARRIVE_KEY = 'uml-arrive-ready';

function loadArrive(where: ArriveWhere, house: HouseId): string[] {
  try {
    return readArriveChecks(sessionStorage.getItem(ARRIVE_KEY), where, house);
  } catch {
    return [];
  }
}

function saveArrive(where: ArriveWhere, house: HouseId, ids: string[]) {
  try {
    const next = writeArriveChecks(sessionStorage.getItem(ARRIVE_KEY), where, house, ids);
    sessionStorage.setItem(ARRIVE_KEY, next);
  } catch {
    /* the check still toggles for this view */
  }
}

/** Published before-arrival steps. A check stays on this page. */
export function ArriveReady({ house, where }: { house: HouseId; where: ArriveWhere }) {
  const steps = arriveReady(house);
  const [done, setDone] = useState<string[]>(() => loadArrive(where, house));
  const bot = where === 'house' ? 'house-arrive' : where === 'quote' ? 'stay-arrive' : 'stay-phone-arrive';
  function toggle(id: string) {
    const next = done.includes(id) ? done.filter((item) => item !== id) : [...done, id];
    setDone(next);
    saveArrive(where, house, next);
  }
  const phone = where === 'phone';
  return (
    <section
      className={phone ? 'mt-4' : 'uml-panel mt-6 rounded-3xl p-6'}
      data-bot={bot}
      data-house={house}
    >
      <p className={phone ? 'text-[11px] font-semibold uppercase tracking-[0.28em] text-[#d4b56a]' : 'uml-kicker'}>
        Before you arrive
      </p>
      <p className={phone ? 'mt-2 text-sm leading-relaxed text-[#d7cfc3]' : 'mt-2 text-sm text-[var(--uml-muted)]'}>
        {arriveReadyNote(where)}
      </p>
      <ul className="mt-4 space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            <label className={phone ? 'flex items-start gap-3 text-sm text-[#f6f1e8]' : 'flex items-start gap-3 text-sm'}>
              <input
                type="checkbox"
                data-bot={`${bot}-${step.id}`}
                checked={done.includes(step.id)}
                onChange={() => toggle(step.id)}
              />
              <span>{step.text}</span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
