import { housePausedLines } from '../lib/home-paused';
import { denverToday } from '../lib/market/dates';
import type { HouseId } from '../lib/market/types';

const NAME: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

export function HousePausedDesk({ house }: { house: HouseId }) {
  return (
    <section className="uml-panel mt-6 rounded-3xl p-6" data-bot="house-paused" data-house={house}>
      <p className="uml-kicker">{NAME[house]}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {housePausedLines(house, denverToday()).map((line) => (
          <li key={line} data-bot="house-paused-line">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
