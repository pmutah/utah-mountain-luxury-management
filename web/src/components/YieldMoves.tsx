import { useEffect, useState } from 'react';
import { api, type SharedWorkItem, type YieldPlan } from '../lib/api';
import { formatWhole } from '../lib/luxury';

const WEEKEND_TONE: Record<string, string> = {
  booked: 'bg-[#d4b56a] text-black',
  'half booked': 'border border-[#d4b56a] text-[#d4b56a]',
  open: 'border border-white/20 text-[var(--uml-muted)]',
  'not open yet': 'text-white/25',
};

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function dateSpan(first: string, last: string) {
  return first === last ? shortDate(first) : `${shortDate(first)} – ${shortDate(last)}`;
}

export function YieldMoves() {
  const [plan, setPlan] = useState<YieldPlan | null>(null);
  const [desk, setDesk] = useState<{ open: SharedWorkItem[]; done: SharedWorkItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getYieldPlan()
      .then(setPlan)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load the yield plan'));
    api.getSharedWork().then(setDesk).catch(() => setDesk({ open: [], done: [] }));
  }, []);

  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="yield-moves">
      <p className="uml-kicker">This week's moves</p>
      <p className="mt-1 text-sm text-[var(--uml-muted)]">
        Set on Airbnb and VRBO directly. Base stays high. Promotions fill the gaps.
      </p>
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      {!plan && !error && <p className="mt-4 text-sm text-[var(--uml-muted)]">Pricing the next 90 days…</p>}
      {plan && (
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {plan.houses.map((house) => {
            const moves = house.moves.filter((move) => move.promotionPercent || move.event);
            return (
              <div key={house.propertyId}>
                <p className="font-display text-2xl">{house.house.replace(/^The /, '').replace(/ House$/, '')}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {house.weekends.map((weekend) => (
                    <span
                      key={weekend.friday}
                      title={`${weekend.status}${weekend.event ? ` · ${weekend.event}` : ''}`}
                      className={`rounded-full px-2 py-0.5 text-[11px] ${WEEKEND_TONE[weekend.status]}`}
                    >
                      {shortDate(weekend.friday)}
                    </span>
                  ))}
                </div>
                <p className="mt-1 text-xs text-[var(--uml-muted)]">Next 8 weekends. Gold is booked.</p>
                {moves.length === 0 ? (
                  <p className="mt-3 text-sm text-[var(--uml-muted)]">
                    {house.goal.stillNeeded === 0 ? 'Goal is on the books. Hold the rate.' : 'No promotions due. Hold the base.'}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {moves.slice(0, 6).map((move) => (
                      <li key={`${move.firstNight}-${move.action}`} className="text-sm">
                        <p>
                          <span className="text-[#d4b56a]">{dateSpan(move.firstNight, move.lastNight)}</span>
                          {move.event ? ` · ${move.event}` : ''}
                        </p>
                        {move.taken?.blocksRepeat ? (
                          <p className="text-[#d4b56a]">
                            {move.taken.status === 'done'
                              ? `${move.taken.ownerName} already posted this ${move.taken.atDenver}.`
                              : `${move.taken.ownerName} is posting this now.`}
                          </p>
                        ) : (
                          <p className="text-[var(--uml-muted)]">{move.action}</p>
                        )}
                        {move.airbnbListNightly != null && (
                          <p className="text-[var(--uml-muted)]">
                            Base {formatWhole(move.airbnbListNightly)} Airbnb / {formatWhole(move.vrboListNightly ?? 0)} VRBO
                            {move.airbnbPromoListNightly != null &&
                              ` → ${formatWhole(move.airbnbPromoListNightly)} / ${formatWhole(move.vrboPromoListNightly ?? 0)} after ${move.promotionPercent}% off`}
                            {move.minStay ? ` · min ${move.minStay}` : ''}
                          </p>
                        )}
                      </li>
                    ))}
                    {moves.length > 6 && (
                      <li className="text-xs text-[var(--uml-muted)]">+{moves.length - 6} more in the agents' plan</li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      {desk && (desk.done.length > 0 || desk.open.length > 0) && (
        <div className="mt-5 border-t border-white/10 pt-4" data-bot="shared-work">
          <p className="text-xs uppercase tracking-widest text-[var(--uml-muted)]">Shared desk</p>
          <ul className="mt-2 space-y-1 text-sm text-[var(--uml-muted)]">
            {desk.done.slice(0, 4).map((item) => (
              <li key={item.key}>
                {item.ownerName} finished {item.title} {item.atDenver}.
              </li>
            ))}
            {desk.open.slice(0, 3).map((item) => (
              <li key={item.key}>
                {item.stale
                  ? `${item.ownerName} claimed ${item.title} ${item.atDenver} and did not finish.`
                  : `${item.ownerName} has ${item.title} since ${item.atDenver}.`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
