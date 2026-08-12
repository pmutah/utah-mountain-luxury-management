import { formatCurrency, PROPERTIES, type Reservation } from '../lib/api';

function nightsBetween(checkIn: string, checkOut: string): number {
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
}

function dayNumber(iso: string): number {
  return Number(iso.slice(8, 10));
}

function isActiveStay(r: Reservation): boolean {
  return r.status !== 'cancelled' && r.status !== 'blocked';
}

function sourceLabel(source: string): string {
  const s = source.trim();
  if (/airbnb/i.test(s)) return 'Airbnb';
  if (/vrbo|homeaway/i.test(s)) return 'VRBO';
  if (/booking/i.test(s)) return 'Booking.com';
  if (/direct/i.test(s)) return 'Direct';
  return s || 'Hospitable';
}

function sourceClass(source: string): string {
  const label = sourceLabel(source);
  if (label === 'Airbnb') return 'bg-rose-500/90 text-white';
  if (label === 'VRBO') return 'bg-sky-500/90 text-white';
  if (label === 'Booking.com') return 'bg-indigo-500/90 text-white';
  if (label === 'Direct') return 'bg-amber-500/90 text-white';
  return 'bg-slate-500/90 text-white';
}

function occupyingNights(res: Reservation, yearMonth: string): Set<number> {
  const [y, m] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const booked = new Set<number>();
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${yearMonth}-${String(d).padStart(2, '0')}`;
    if (iso >= res.checkIn && iso < res.checkOut) booked.add(d);
  }
  return booked;
}

function StayCard({ res }: { res: Reservation }) {
  const nights = nightsBetween(res.checkIn, res.checkOut);
  const source = sourceLabel(res.source);
  return (
    <div
      className="mt-0.5 rounded-md bg-black/25 backdrop-blur-[2px] px-1 py-0.5 text-left leading-tight"
      title={`${res.guestName} · ${nights} night${nights === 1 ? '' : 's'} · ${formatCurrency(res.payout)} · ${source}`}
    >
      <p className="text-[9px] sm:text-[10px] font-black text-white truncate">{res.guestName}</p>
      <p className="text-[8px] sm:text-[9px] font-bold text-white/95 tabular-nums">
        {formatCurrency(res.payout)}
      </p>
      <p className="text-[8px] font-bold text-white/80">
        {nights} {nights === 1 ? 'night' : 'nights'}
      </p>
      <span
        className={`inline-block mt-0.5 rounded px-1 py-px text-[7px] font-black uppercase tracking-wide ${sourceClass(res.source)}`}
      >
        {source}
      </span>
    </div>
  );
}

export function OccupancyCalendar({
  propertyId,
  month,
  reservations,
}: {
  propertyId: string;
  month: string;
  reservations: Reservation[];
}) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = new Date(y, m - 1, 1).getDay();
  const stays = reservations.filter((r) => r.propertyId === propertyId && isActiveStay(r));

  const nightsByDay = new Map<number, Reservation[]>();
  const checkInByDay = new Map<number, Reservation[]>();

  for (const res of stays) {
    const nights = occupyingNights(res, month);
    nights.forEach((d) => {
      const list = nightsByDay.get(d) ?? [];
      list.push(res);
      nightsByDay.set(d, list);
    });
    const checkInDay =
      res.checkIn.startsWith(month) ? dayNumber(res.checkIn) : nights.has(1) ? 1 : null;
    if (checkInDay != null && nights.has(checkInDay)) {
      const list = checkInByDay.get(checkInDay) ?? [];
      list.push(res);
      checkInByDay.set(checkInDay, list);
    }
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const isRanch = propertyId === 'ranch';
  const occupiedClass = isRanch
    ? 'bg-blue-600/80 border-blue-400/40'
    : 'bg-emerald-600/80 border-emerald-400/40';
  const checkInClass = isRanch
    ? 'bg-blue-600 border-blue-300/50 ring-1 ring-blue-300/40'
    : 'bg-emerald-600 border-emerald-300/50 ring-1 ring-emerald-300/40';

  return (
    <div className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden">
      <div className="p-6 border-b border-slate-800 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h4 className="text-sm font-black uppercase tracking-widest">Occupancy calendar</h4>
          <p className="text-[10px] text-slate-500 font-bold mt-1">{PROPERTIES[propertyId]?.name}</p>
        </div>
        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-wide">
          Check-in day shows guest, host payout, nights, and channel
        </p>
      </div>
      <div className="p-3 sm:p-4">
        <div className="grid grid-cols-7 gap-1 text-[9px] font-bold text-slate-600 uppercase text-center mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`e-${i}`} className="min-h-[4.5rem] sm:min-h-[6.5rem]" />;
            const occupying = nightsByDay.get(day) ?? [];
            const checkIns = checkInByDay.get(day) ?? [];
            const occupied = occupying.length > 0;
            return (
              <div
                key={day}
                className={`min-h-[4.5rem] sm:min-h-[6.5rem] rounded-lg border p-1 flex flex-col ${
                  checkIns.length
                    ? checkInClass
                    : occupied
                      ? occupiedClass
                      : 'bg-slate-950/50 text-slate-600 border-slate-800/50'
                } ${occupied ? 'text-white' : ''}`}
              >
                <span
                  className={`text-[10px] font-black leading-none ${occupied ? 'text-white/90' : 'text-slate-500'}`}
                >
                  {day}
                </span>
                {checkIns.map((res) => (
                  <StayCard key={res.id} res={res} />
                ))}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-4 text-[9px] font-bold text-slate-500 uppercase">
          <span>
            {nightsByDay.size} booked nights · {((nightsByDay.size / daysInMonth) * 100).toFixed(0)}% of
            month
          </span>
          <span className="hidden sm:inline text-slate-700">·</span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-rose-500" /> Airbnb
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-sky-500" /> VRBO
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-sm bg-indigo-500" /> Booking.com
          </span>
        </div>
      </div>
    </div>
  );
}

export function RevenueLog({
  propertyId,
  month,
  reservations,
}: {
  propertyId: string;
  month: string;
  reservations: Reservation[];
}) {
  const list = reservations.filter(
    (r) => r.propertyId === propertyId && r.checkIn.startsWith(month) && isActiveStay(r),
  );

  if (!list.length) {
    return null;
  }

  return (
    <div className="p-4 space-y-2">
      {list.map((res) => {
        const nights = nightsBetween(res.checkIn, res.checkOut);
        return (
          <div
            key={res.id}
            className="flex justify-between items-center p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50"
          >
            <div className="min-w-0">
              <p className="font-black text-sm text-white truncate">{res.guestName}</p>
              <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">
                {res.checkIn.slice(5)} to {res.checkOut.slice(5)} · {nights}{' '}
                {nights === 1 ? 'night' : 'nights'} · {sourceLabel(res.source)}
              </p>
            </div>
            <div className="text-right shrink-0 ml-2">
              <p className="font-black text-sm text-slate-300">{formatCurrency(res.payout)}</p>
              <p className="text-[8px] text-slate-600 font-bold uppercase">Host payout</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
