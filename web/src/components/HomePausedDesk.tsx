import { denverToday } from '../lib/market/dates';
import { homePausedLines } from '../lib/home-paused';

export function HomePausedDesk() {
  return (
    <section className="uml-panel mt-6 rounded-3xl p-6" data-bot="home-paused">
      <p className="uml-kicker">While the bookings are unread</p>
      <ul className="mt-3 space-y-2 text-sm">
        {homePausedLines(denverToday()).map((line) => (
          <li key={line} data-bot="home-paused-line">
            {line}
          </li>
        ))}
      </ul>
    </section>
  );
}
