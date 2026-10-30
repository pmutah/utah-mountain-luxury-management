import type { Reservation } from '../lib/api';
import { workOrderCheckoutParty, workOrderNext, workOrderParty, workOrderRules, workOrderWhen } from '../lib/clean';
import { codesOpenTomorrow } from '../lib/house-stay';
import { formatWhole } from '../lib/luxury';
import { currentDayIso } from '../lib/months';
import { occupancyCalendar, occupancyFilename } from '../lib/occupancy-calendar';
import { grossPace, type GoalHouse } from '../lib/revenue-goals';
import { buildTodayDesk, buildTurnovers, type StayMove } from '../lib/today';

const HOUSES: { id: GoalHouse; label: string }[] = [
  { id: 'ranch', label: 'Ranch' },
  { id: 'lindon', label: 'Lindon' },
  { id: 'river', label: 'River' },
];

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function Ring({ booked, target }: { booked: number; target: number }) {
  const ratio = target > 0 ? Math.max(0, Math.min(1, booked / target)) : 0;
  const radius = 28;
  const length = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 72 72" className="h-16 w-16" aria-hidden="true">
      <circle cx="36" cy="36" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="6" />
      <circle
        cx="36"
        cy="36"
        r={radius}
        fill="none"
        stroke="#d4b56a"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(length * ratio).toFixed(1)} ${length.toFixed(1)}`}
        transform="rotate(-90 36 36)"
      />
    </svg>
  );
}

function MoveList({ title, moves, empty }: { title: string; moves: StayMove[]; empty: string }) {
  return (
    <div>
      <p className="uml-kicker">{title}</p>
      {moves.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--uml-muted)]">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {moves.map((move) => (
            <li key={move.id} className="text-sm">
              <p>
                <span className="text-[#d4b56a]">{shortDate(move.date)}</span>
                {` · ${move.houseName} · ${move.guest}`}
              </p>
              <p className="text-[var(--uml-muted)]">{move.nights} nights</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TodayDesk({ reservations }: { reservations: Reservation[] }) {
  const asOf = currentDayIso();
  const desk = buildTodayDesk(reservations, asOf);
  const turns = buildTurnovers(reservations, asOf);
  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="today-desk">
      <p className="uml-kicker">Today</p>
      <p className="mt-2 text-sm" data-bot="today-codes">
        {codesOpenTomorrow(reservations, asOf, 'list')}
      </p>
      <h2 className="font-display text-4xl leading-none mt-1">The next seven days</h2>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {HOUSES.map((house) => {
          const pace = grossPace(house.id, reservations, asOf);
          return (
            <div key={house.id} className="flex items-center gap-3">
              <Ring booked={pace.booked} target={pace.target} />
              <div>
                <p className="uml-kicker">{house.label}</p>
                <p className="font-display text-2xl uml-num leading-none mt-1">
                  {formatWhole(pace.booked)}
                </p>
                <p className="text-xs text-[var(--uml-muted)]">
                  of {formatWhole(pace.target)} · {desk.openNext30[house.id]} open nights ahead
                </p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <MoveList title="Arriving" moves={desk.arrivals} empty="No arrivals this week." />
        <MoveList title="Leaving" moves={desk.departures} empty="No departures this week." />
      </div>
      <div className="mt-6" data-bot="today-calendar">
        <p className="text-sm text-[var(--uml-muted)]">
          Taken nights only. Names stay off this file. Downloading does not change a booking.
        </p>
        <button
          type="button"
          className="uml-nav mt-3"
          data-bot="today-calendar-file"
          onClick={() => {
            const file = new Blob(
              [
                occupancyCalendar(
                  reservations.map((stay) => ({
                    propertyId: stay.propertyId,
                    checkIn: stay.checkIn,
                    checkOut: stay.checkOut,
                    status: stay.status,
                  })),
                  asOf,
                ),
              ],
              { type: 'text/calendar' },
            );
            const url = URL.createObjectURL(file);
            const link = document.createElement('a');
            link.href = url;
            link.download = occupancyFilename();
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Download occupancy
        </button>
      </div>
      <div className="mt-6" data-bot="turnovers">
        <p className="uml-kicker">Turnovers</p>
        <p className="mt-2 text-sm text-[var(--uml-muted)]">
          Quiet hours are the guest&rsquo;s rule. This list does not change a booking.
        </p>
        {turns.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--uml-muted)]">No turnovers in the next two weeks.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {turns.map((turn) => (
              <li key={turn.id} className="text-sm" data-bot="today-turnover" data-house={turn.house}>
                <p>
                  <span className="text-[#d4b56a]">{shortDate(turn.checkout)}</span>
                  {` · ${turn.houseName} · `}
                  {turn.gapNights === null
                    ? 'nothing booked after'
                    : turn.gapNights === 0
                      ? 'same-day clean'
                      : `${turn.gapNights} night${turn.gapNights === 1 ? '' : 's'} before the next arrival`}
                </p>
                <p className="text-[var(--uml-muted)]" data-bot="today-turnover-when">
                  {workOrderWhen(turn.house, turn.gapNights === 0, 'en')}
                </p>
                <p data-bot="today-turnover-checkout">{workOrderCheckoutParty(turn.checkoutGuests, 'en')}</p>
                <p data-bot="today-turnover-next">{workOrderNext(turn.nextCheckIn, turn.gapNights, 'en')}</p>
                {turn.nextCheckIn && <p data-bot="today-turnover-party">{workOrderParty(turn.nextGuests, 'en')}</p>}
                {workOrderRules(turn.house, 'en').map((line) => (
                  <p key={line} data-bot="today-turnover-rule">
                    {line}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
