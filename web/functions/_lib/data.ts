export const PROPERTIES = {
  ranch: { id: 'ranch', name: 'The Ranch House', address: '270 E Center St', cleaningFee: 350, accentColor: 'bg-blue-500', mortgage: 3133.36 },
  lindon: { id: 'lindon', name: 'The Lindon House', address: '1011 E 100 N', cleaningFee: 160, accentColor: 'bg-emerald-500', mortgage: 1265.14 },
} as const;

type PropertyId = keyof typeof PROPERTIES;

export const RESERVATIONS = [
  { id: 'r1', guestName: "Kristin's Group", propertyId: 'ranch', checkIn: '2026-01-15', checkOut: '2026-01-19', payout: 2232.94, source: 'Airbnb' },
  { id: 'r2', guestName: "Andrew's Group", propertyId: 'ranch', checkIn: '2026-01-25', checkOut: '2026-01-28', payout: 1613.73, source: 'Airbnb' },
  { id: 'r3', guestName: 'Stacey Lucas', propertyId: 'ranch', checkIn: '2026-02-04', checkOut: '2026-03-02', payout: 11236.08, source: 'VRBO' },
  { id: 'r4', guestName: 'Bryan Murray', propertyId: 'ranch', checkIn: '2026-03-05', checkOut: '2026-03-09', payout: 2302.27, source: 'VRBO' },
  { id: 'r5', guestName: "Blake's Group", propertyId: 'ranch', checkIn: '2026-03-11', checkOut: '2026-03-15', payout: 2303.75, source: 'Airbnb' },
  { id: 'r6', guestName: "Zach's Group", propertyId: 'ranch', checkIn: '2026-03-24', checkOut: '2026-03-27', payout: 1813.37, source: 'Airbnb' },
  { id: 'r7', guestName: 'Kal Preece', propertyId: 'ranch', checkIn: '2026-04-01', checkOut: '2026-04-05', payout: 1509.27, source: 'Airbnb' },
  { id: 'r8', guestName: 'Adam Davis', propertyId: 'ranch', checkIn: '2026-04-15', checkOut: '2026-04-19', payout: 2228.09, source: 'Airbnb' },
  { id: 'r9', guestName: "Michele's Group", propertyId: 'ranch', checkIn: '2026-04-22', checkOut: '2026-04-26', payout: 2080.65, source: 'Airbnb' },
  { id: 'r10', guestName: 'Danette McLane', propertyId: 'ranch', checkIn: '2026-04-27', checkOut: '2026-05-02', payout: 2696.6, source: 'Airbnb' },
  { id: 'r11', guestName: 'Mario Hernandez', propertyId: 'ranch', checkIn: '2026-05-02', checkOut: '2026-05-03', payout: 659.34, source: 'Airbnb' },
  { id: 'r12', guestName: 'Savanna Enriquez', propertyId: 'ranch', checkIn: '2026-05-07', checkOut: '2026-05-10', payout: 1553.47, source: 'VRBO' },
  { id: 'r13', guestName: "Alyson's Group", propertyId: 'ranch', checkIn: '2026-05-13', checkOut: '2026-05-17', payout: 2319.52, source: 'Airbnb' },
  { id: 'r14', guestName: 'Pam Boyd', propertyId: 'ranch', checkIn: '2026-05-19', checkOut: '2026-05-28', payout: 4318.67, source: 'VRBO' },
  { id: 'r15', guestName: 'Becky Dolin', propertyId: 'ranch', checkIn: '2026-05-28', checkOut: '2026-06-02', payout: 2952.99, source: 'VRBO' },
  { id: 'r16', guestName: "Cyndi's Group", propertyId: 'ranch', checkIn: '2026-06-04', checkOut: '2026-06-07', payout: 2601.54, source: 'Airbnb' },
  { id: 'r17', guestName: 'David Secrist', propertyId: 'ranch', checkIn: '2026-06-11', checkOut: '2026-06-14', payout: 2295.26, source: 'VRBO' },
  { id: 'r18', guestName: "Karen's Group", propertyId: 'ranch', checkIn: '2026-06-17', checkOut: '2026-06-22', payout: 3796.58, source: 'Airbnb' },
  { id: 'r19', guestName: 'Debra Phythian', propertyId: 'ranch', checkIn: '2026-06-23', checkOut: '2026-06-30', payout: 2869.18, source: 'VRBO' },
  { id: 'r20', guestName: "Erin's Group", propertyId: 'ranch', checkIn: '2026-07-01', checkOut: '2026-07-04', payout: 2320.37, source: 'Airbnb' },
  { id: 'r-norah', guestName: 'Norah Lusk', propertyId: 'ranch', checkIn: '2026-07-09', checkOut: '2026-07-12', payout: 2320.37, source: 'Airbnb' },
  { id: 'r21', guestName: 'Nathan Wheeler', propertyId: 'ranch', checkIn: '2026-07-21', checkOut: '2026-07-26', payout: 3612.36, source: 'Direct' },
  { id: 'r22', guestName: "Glen's Group", propertyId: 'ranch', checkIn: '2026-07-28', checkOut: '2026-08-02', payout: 3948.87, source: 'Airbnb' },
  { id: 'r23', guestName: "Duncan's Group", propertyId: 'ranch', checkIn: '2026-08-06', checkOut: '2026-08-18', payout: 3692.6, source: 'Airbnb' },
  { id: 'r24', guestName: 'Michael White', propertyId: 'ranch', checkIn: '2026-09-17', checkOut: '2026-09-20', payout: 1553.47, source: 'Direct' },
  { id: 'r25', guestName: 'Chloe Meyer', propertyId: 'ranch', checkIn: '2026-09-24', checkOut: '2026-09-28', payout: 2503.57, source: 'Airbnb' },
  { id: 'r26', guestName: "Melanie's Group", propertyId: 'ranch', checkIn: '2026-10-14', checkOut: '2026-10-18', payout: 2319.52, source: 'Airbnb' },
  { id: 'r27', guestName: 'Rick Harrison', propertyId: 'ranch', checkIn: '2026-12-18', checkOut: '2026-12-21', payout: 1553.47, source: 'Direct' },
  { id: 'l1', guestName: 'Kim Smelcer', propertyId: 'lindon', checkIn: '2026-01-04', checkOut: '2026-01-17', payout: 927.46, source: 'Airbnb' },
  { id: 'l2', guestName: 'Robert Koop', propertyId: 'lindon', checkIn: '2026-01-29', checkOut: '2026-02-02', payout: 682.27, source: 'Airbnb' },
  { id: 'l3', guestName: "Jacob's Group", propertyId: 'lindon', checkIn: '2026-02-06', checkOut: '2026-02-09', payout: 580.06, source: 'Airbnb' },
  { id: 'l4', guestName: "Shawn's Group", propertyId: 'lindon', checkIn: '2026-02-13', checkOut: '2026-02-16', payout: 580.06, source: 'Airbnb' },
  { id: 'l5', guestName: "Scott's Group", propertyId: 'lindon', checkIn: '2026-02-21', checkOut: '2026-02-25', payout: 726.53, source: 'Airbnb' },
  { id: 'l6', guestName: 'Chase Dowling', propertyId: 'lindon', checkIn: '2026-03-06', checkOut: '2026-03-09', payout: 425.49, source: 'Airbnb' },
  { id: 'l7', guestName: 'Quincy McKinney', propertyId: 'lindon', checkIn: '2026-03-21', checkOut: '2026-03-29', payout: 1185.15, source: 'Airbnb' },
  { id: 'l8', guestName: 'Amber Pearce', propertyId: 'lindon', checkIn: '2026-04-01', checkOut: '2026-04-06', payout: 622.02, source: 'Airbnb' },
  { id: 'l9', guestName: 'Meredyth Grover', propertyId: 'lindon', checkIn: '2026-04-09', checkOut: '2026-04-12', payout: 503.37, source: 'Airbnb' },
  { id: 'l10', guestName: 'Andrew Crain', propertyId: 'lindon', checkIn: '2026-04-14', checkOut: '2026-04-17', payout: 405.06, source: 'Airbnb' },
  { id: 'l11', guestName: 'Jason Bylund', propertyId: 'lindon', checkIn: '2026-04-22', checkOut: '2026-04-25', payout: 504.89, source: 'Airbnb' },
  { id: 'l12', guestName: 'Abby Warden', propertyId: 'lindon', checkIn: '2026-04-26', checkOut: '2026-05-01', payout: 788.25, source: 'Airbnb' },
  { id: 'l13', guestName: 'Paul Lora Gardner', propertyId: 'lindon', checkIn: '2026-05-01', checkOut: '2026-05-04', payout: 504.89, source: 'Airbnb' },
  { id: 'l14', guestName: 'Heather Stotts', propertyId: 'lindon', checkIn: '2026-05-05', checkOut: '2026-05-09', payout: 867.18, source: 'Airbnb' },
  { id: 'l15', guestName: 'Kristen Gasaway', propertyId: 'lindon', checkIn: '2026-05-09', checkOut: '2026-05-13', payout: 654.98, source: 'Airbnb' },
  { id: 'l16', guestName: 'Matthew Cox', propertyId: 'lindon', checkIn: '2026-05-14', checkOut: '2026-05-17', payout: 693.44, source: 'VRBO' },
  { id: 'l17', guestName: 'Bryce Crabbs', propertyId: 'lindon', checkIn: '2026-05-22', checkOut: '2026-05-25', payout: 687.77, source: 'Airbnb' },
  { id: 'l18', guestName: 'Sandra Jenkins', propertyId: 'lindon', checkIn: '2026-05-28', checkOut: '2026-06-01', payout: 627.69, source: 'Airbnb' },
  { id: 'l19', guestName: 'Serenity Post-Jones', propertyId: 'lindon', checkIn: '2026-06-04', checkOut: '2026-06-08', payout: 838.32, source: 'Airbnb' },
  { id: 'l20', guestName: 'Todd Meyers', propertyId: 'lindon', checkIn: '2026-06-09', checkOut: '2026-06-14', payout: 1282.71, source: 'Airbnb' },
  { id: 'l21', guestName: 'Matthew Simon', propertyId: 'lindon', checkIn: '2026-06-22', checkOut: '2026-06-26', payout: 840.8, source: 'Airbnb' },
  { id: 'l22', guestName: 'Shanda Evans', propertyId: 'lindon', checkIn: '2026-06-28', checkOut: '2026-07-05', payout: 1192.59, source: 'Airbnb' },
  { id: 'l23', guestName: 'Doeeen Gardner', propertyId: 'lindon', checkIn: '2026-08-13', checkOut: '2026-08-17', payout: 1110.65, source: 'Airbnb' },
  { id: 'l24', guestName: 'Angela Meyer', propertyId: 'lindon', checkIn: '2026-09-23', checkOut: '2026-09-28', payout: 958.36, source: 'Airbnb' },
  { id: 'l25', guestName: 'Jason Parkin', propertyId: 'lindon', checkIn: '2026-11-22', checkOut: '2026-11-29', payout: 1299.78, source: 'Airbnb' },
];

export const EXPENSES = [
  ...Array.from({ length: 12 }, (_, i) => {
    const m = `2026-${String(i + 1).padStart(2, '0')}`;
    return [
      { id: `r-mtg-${m}`, month: m, propertyId: 'ranch', category: 'Mortgage', amount: 3133.36 },
      { id: `l-mtg-${m}`, month: m, propertyId: 'lindon', category: 'Mortgage', amount: 1265.14 },
    ];
  }).flat(),
  { id: 'l-ace-05', month: '2026-05', propertyId: 'lindon', category: 'Maintenance', amount: 1.29 },
];

export const DEFAULT_EXTRA_CLEANING: Record<string, number> = { 'ranch-2026-02': 572.92 };

function getOverlappingNights(checkIn: string, checkOut: string, targetYearMonth: string): number {
  const [year, month] = targetYearMonth.split('-');
  const monthStart = new Date(Number(year), Number(month) - 1, 1);
  const monthEnd = new Date(Number(year), Number(month), 0);
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  const actualStart = start < monthStart ? monthStart : start;
  const actualEnd = end > monthEnd ? monthEnd : end;
  if (actualStart >= actualEnd) return 0;
  return Math.round((actualEnd.getTime() - actualStart.getTime()) / (1000 * 60 * 60 * 24));
}

export function calculateMetrics(
  propId: PropertyId,
  currentMonth: string,
  extraCleaningFees: Record<string, number> = DEFAULT_EXTRA_CLEANING,
  expenseList: Array<{ propertyId: string; month: string; category: string; amount: number }> = EXPENSES,
) {
  let revenue = 0;
  let baseCleaning = 0;
  let occupied = 0;
  let stayCount = 0;

  for (const res of RESERVATIONS.filter((r) => r.propertyId === propId)) {
    if (res.checkIn.startsWith(currentMonth)) {
      revenue += Number(res.payout);
      baseCleaning += PROPERTIES[propId].cleaningFee;
      stayCount++;
    }
    occupied += getOverlappingNights(res.checkIn, res.checkOut, currentMonth);
  }

  const extra = Number(extraCleaningFees[`${propId}-${currentMonth}`] || 0);
  const totalCleaning = baseCleaning + extra;
  const mortgage = PROPERTIES[propId].mortgage;
  const operationalExpenses = expenseList.filter(
    (e) => e.propertyId === propId && e.month === currentMonth && e.category !== 'Mortgage',
  ).reduce((sum, e) => sum + e.amount, 0);
  const [yearStr, monthStr] = currentMonth.split('-');
  const days = new Date(Number(yearStr), Number(monthStr), 0).getDate();
  const profit = revenue - (mortgage + totalCleaning + operationalExpenses);

  let dist = null;
  if (propId === 'ranch') {
    const basis = revenue - totalCleaning;
    const mgtFee = basis > 0 ? basis * 0.2 : 0;
    const leftover = basis - mgtFee - (mortgage + operationalExpenses);
    const share = leftover > 0 ? leftover / 2 : 0;
    dist = { brandon: mgtFee + share, todd: share, mgtFee };
  }

  return {
    propertyId: propId,
    revenue,
    baseCleaning,
    extra,
    totalCleaning,
    mortgage,
    operationalExpenses,
    profit,
    occupancy: (occupied / days) * 100,
    stayCount,
    dist,
  };
}

export function corsJson(
  request: Request,
  data: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '*',
    'Access-Control-Allow-Methods': 'GET, PUT, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    ...extraHeaders,
  };
  if (status === 204) return new Response(null, { status, headers });
  return new Response(JSON.stringify(data), { status, headers });
}
