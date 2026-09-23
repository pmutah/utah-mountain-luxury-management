import { PROPERTIES, formatCurrency, type PortfolioData, type Reservation } from '../lib/api';
import { currentDayIso } from '../lib/months';
import { propertyHealth, type HealthSignals, type HouseId } from '../lib/luxury';
import { HOUSE_PHOTOS } from '../lib/house-photos';
import { HealthDial } from './HealthDial';

function seasonOf(month: string) {
  const m = Number(month.slice(5, 7));
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'autumn';
}

function Scene({ id, month }: { id: HouseId; month: string }) {
  const season = seasonOf(month);
  const sky =
    season === 'winter' ? '#1c3340' : season === 'summer' ? '#1d4a52' : season === 'spring' ? '#1a3d3a' : '#3a2a22';
  const ground = season === 'winter' ? '#d7e2ea' : season === 'autumn' ? '#8a5a32' : '#2f6a48';
  const ridge = id === 'river' ? '#16343a' : '#10241f';
  return (
    <svg viewBox="0 0 640 280" className="w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="640" height="280" fill={sky} />
      <circle cx={season === 'winter' ? 520 : 500} cy="64" r="28" fill="#f3e6c4" opacity={season === 'winter' ? 0.85 : 0.55} />
      <path d="M0 168 L90 110 L170 150 L260 78 L360 140 L470 64 L560 120 L640 90 V280 H0 Z" fill={ridge} />
      <path d="M0 210 C120 180 180 230 320 200 C460 170 520 220 640 190 V280 H0 Z" fill={ground} opacity="0.9" />
      {id === 'river' && (
        <path d="M40 230 C160 210 220 250 340 226 C460 202 520 236 640 214" fill="none" stroke="#9fd4d0" strokeWidth="3" opacity="0.8" />
      )}
      {season === 'winter' && (
        <g fill="#fff" opacity="0.55">
          <circle cx="80" cy="40" r="1.2" />
          <circle cx="140" cy="70" r="1" />
          <circle cx="220" cy="36" r="1.3" />
          <circle cx="300" cy="58" r="1" />
          <circle cx="400" cy="32" r="1.2" />
        </g>
      )}
    </svg>
  );
}

function nextArrival(reservations: Reservation[], id: HouseId) {
  const today = currentDayIso();
  return reservations
    .filter((r) => r.propertyId === id && r.status !== 'cancelled' && r.checkOut > today)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0];
}

export function PropertyPostcards({
  data,
  onOpen,
  onOpenBuild,
  signals,
}: {
  data: PortfolioData;
  onOpen: (id: HouseId) => void;
  onOpenBuild: () => void;
  signals?: (id: HouseId) => HealthSignals;
}) {
  const ids: HouseId[] = ['ranch', 'lindon', 'river'];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {ids.map((id) => {
        const metrics = data[id];
        const health = propertyHealth(id, metrics, signals?.(id));
        const stay = nextArrival(data.reservations, id);
        const when = stay
          ? new Date(`${stay.checkIn}T00:00:00`).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })
          : null;
        const photo = HOUSE_PHOTOS[id];
        return (
          <article
            key={id}
            className="text-left rounded-3xl overflow-hidden border border-[var(--uml-line)] bg-[#0c1c19]"
          >
            <button type="button" onClick={() => onOpen(id)} className="block w-full text-left">
            <div className="relative h-40">
              {photo ? (
                <img src={photo.src} alt="" className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <Scene id={id} month={data.month} />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#07110f] via-transparent to-transparent" />
              <div className="absolute top-3 right-3">
                <HealthDial score={health.score} size={54} ink="#f4f1ea" />
              </div>
              <p className="absolute bottom-3 left-4 font-display text-2xl text-[#f4f1ea]">
                {PROPERTIES[id].name.replace('The ', '')}
              </p>
            </div>
            <div className="px-4 pt-4 pb-2 space-y-1">
              <p className="font-display uml-num text-3xl text-[var(--uml-ink)]">{formatCurrency(metrics.revenue)}</p>
              <p className="text-xs text-[var(--uml-muted)]">
                {metrics.occupancy.toFixed(0)}% occupied · {metrics.stayCount} stays
              </p>
            </div>
              <p className="text-sm text-[var(--uml-ink)] px-4 pb-4">
                {stay && when
                  ? stay.checkIn <= currentDayIso()
                    ? `In house — ${stay.guestName}`
                    : `Arriving ${when} — ${stay.guestName}`
                  : 'No upcoming arrival'}
              </p>
            </button>
            {id === 'river' && (
              <div className="px-4 pb-4">
                <button type="button" className="uml-kicker text-[var(--uml-gold)]" onClick={onOpenBuild}>
                  Build costs
                </button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
