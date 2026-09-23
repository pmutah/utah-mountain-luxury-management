import { useEffect, useMemo, useState } from 'react';
import { api, type ConstructionProject, type Reservation } from '../lib/api';
import { RIVER_FIRST_STAY } from '../lib/brand';
import { CONSTRUCTION_STAGES } from '../lib/construction-stages';
import { HOUSE_PHOTOS } from '../lib/house-photos';

const CHECKS = [
  { id: 'dry-in', group: 'Build', label: 'Weather-tight and dried in' },
  { id: 'mep', group: 'Build', label: 'Rough mechanical, electrical, and plumbing done' },
  { id: 'finishes', group: 'Build', label: 'Finishes far enough for photos' },
  { id: 'co', group: 'Build', label: 'Certificate of occupancy in hand' },
  { id: 'furnish', group: 'House', label: 'Furnishings and linens for 24' },
  { id: 'hot-tub', group: 'House', label: 'Hot tub, sauna, and fire pit ready' },
  { id: 'kitchen', group: 'House', label: 'Both kitchens stocked' },
  { id: 'listing', group: 'Listing', label: 'Live photos replace the renderings' },
  { id: 'rates', group: 'Listing', label: 'November rates published' },
  { id: 'manual', group: 'Listing', label: 'House manual and lock notes written' },
  { id: 'cleaner', group: 'Listing', label: 'Turnover cleaner confirmed for a 24-guest house' },
];

function daysUntil(iso: string) {
  const target = new Date(`${iso}T00:00:00`).getTime();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now.getTime()) / 86400000);
}

export function RiverLaunch({ reservations }: { reservations: Reservation[] }) {
  const [project, setProject] = useState<ConstructionProject | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const days = daysUntil(RIVER_FIRST_STAY);
  const photo = HOUSE_PHOTOS.river;

  useEffect(() => {
    api.getConstructionProject().then(setProject).catch(() => setProject(null));
    try {
      const raw = localStorage.getItem('uml-river-launch');
      if (raw) setDone(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* ignore */
    }
  }, []);

  const bookings = useMemo(
    () =>
      reservations
        .filter(
          (stay) =>
            stay.propertyId === 'river' &&
            stay.checkIn >= RIVER_FIRST_STAY &&
            stay.status !== 'cancelled',
        )
        .sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    [reservations],
  );

  const stageIndex = CONSTRUCTION_STAGES.findIndex(
    (stage) => stage.toLowerCase() === (project?.currentStage ?? '').toLowerCase(),
  );
  const checked = CHECKS.filter((item) => done[item.id]).length;

  function toggle(id: string) {
    const next = { ...done, [id]: !done[id] };
    setDone(next);
    localStorage.setItem('uml-river-launch', JSON.stringify(next));
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--uml-line)] min-h-[280px]">
        {photo && (
          <img src={photo.src} alt="Provo Riverhouse" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#07110f] via-[#07110f]/70 to-[#07110f]/20" />
        <div className="relative p-8 sm:p-10 text-[#f4f1ea]">
          <p className="uml-kicker text-[#e7d7b1]">River House · Vivian Park</p>
          <h2 className="font-display text-5xl mt-2">November 1</h2>
          <p className="font-display text-2xl mt-2">
            {days > 0 ? `${days} days until the first stays` : days === 0 ? 'First stays are today' : 'The house is open'}
          </p>
          <p className="text-sm mt-3 max-w-xl text-[#e7eee9]">
            Sleeps 25. The opening moved from October 15. {photo?.caption}.
          </p>
        </div>
      </section>

      <section className="uml-panel rounded-3xl p-6">
        <p className="uml-kicker">Build stage</p>
        <p className="font-display text-3xl">{project?.currentStage ?? 'Loading the project'}</p>
        <ol className="mt-4 flex gap-3 overflow-x-auto text-[10px] uppercase tracking-widest text-[var(--uml-muted)]">
          {CONSTRUCTION_STAGES.map((stage, index) => (
            <li key={stage} className={stageIndex >= 0 && index <= stageIndex ? 'text-[var(--uml-gold)]' : ''}>
              {stage}
            </li>
          ))}
        </ol>
      </section>

      <section className="uml-panel rounded-3xl p-6">
        <p className="uml-kicker">Opening list · {checked} of {CHECKS.length}</p>
        <ul className="mt-3 divide-y divide-[var(--uml-line)]">
          {CHECKS.map((item) => (
            <li key={item.id}>
              <label className="flex items-center gap-3 py-3 cursor-pointer">
                <input type="checkbox" checked={Boolean(done[item.id])} onChange={() => toggle(item.id)} />
                <span className="uml-kicker w-16">{item.group}</span>
                <span className={done[item.id] ? 'text-[var(--uml-muted)] line-through' : ''}>{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="uml-panel rounded-3xl p-6">
        <p className="uml-kicker">First bookings</p>
        {bookings.length === 0 ? (
          <p className="font-display text-2xl mt-2">No November stays on the books yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {bookings.map((stay) => (
              <li key={stay.id} className="flex justify-between gap-3">
                <span>{stay.guestName}</span>
                <span className="text-[var(--uml-muted)]">
                  {stay.checkIn} → {stay.checkOut}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
