import { formatCurrency, PROPERTIES, type Reservation } from '../lib/api';

function nightsInMonth(checkIn: string, checkOut: string, yearMonth: string): Set<number> {
  const [y, m] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthStart = new Date(y, m - 1, 1);
  const monthEnd = new Date(y, m, 0);
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const actualStart = start < monthStart ? monthStart : start;
  const actualEnd = end > monthEnd ? monthEnd : end;
  const booked = new Set<number>();
  if (actualStart >= actualEnd) return booked;
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(y, m - 1, d);
    if (day >= actualStart && day < actualEnd) booked.add(d);
  }
  return booked;
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
  const booked = new Set<number>();
  for (const res of reservations.filter((r) => r.propertyId === propertyId)) {
    nightsInMonth(res.checkIn, res.checkOut, month).forEach((d) => booked.add(d));
  }

  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const accent = propertyId === 'ranch' ? 'bg-blue-600' : 'bg-emerald-600';

  return (
    <div className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden">
      <div className="p-6 border-b border-slate-800">
        <h4 className="text-sm font-black uppercase tracking-widest">Occupancy calendar</h4>
        <p className="text-[10px] text-slate-500 font-bold mt-1">{PROPERTIES[propertyId]?.name}</p>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-7 gap-1 text-[9px] font-bold text-slate-600 uppercase text-center mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) =>
            day === null ? (
              <div key={`e-${i}`} className="aspect-square" />
            ) : (
              <div
                key={day}
                className={`aspect-square rounded-lg flex items-center justify-center text-[10px] font-black ${
                  booked.has(day) ? `${accent} text-white` : 'bg-slate-950/50 text-slate-600 border border-slate-800/50'
                }`}
              >
                {day}
              </div>
            ),
          )}
        </div>
        <p className="text-[9px] text-slate-600 font-bold mt-4 text-center">
          {booked.size} booked nights · {((booked.size / daysInMonth) * 100).toFixed(0)}% of month
        </p>
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
    (r) => r.propertyId === propertyId && r.checkIn.startsWith(month),
  );

  if (!list.length) {
    return null;
  }

  return (
    <div className="p-4 space-y-2">
      {list.map((res) => (
        <div
          key={res.id}
          className="flex justify-between items-center p-4 bg-slate-950/50 rounded-2xl border border-slate-800/50"
        >
          <div className="min-w-0">
            <p className="font-black text-sm text-white truncate">{res.guestName}</p>
            <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">
              {res.checkIn.slice(5)} to {res.checkOut.slice(5)} • {res.source}
            </p>
          </div>
          <div className="text-right shrink-0 ml-2">
            <p className="font-black text-sm text-slate-300">{formatCurrency(res.payout)}</p>
            <p className="text-[8px] text-slate-600 font-bold uppercase">Host payout</p>
          </div>
        </div>
      ))}
    </div>
  );
}
