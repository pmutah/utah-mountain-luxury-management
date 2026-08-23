export const PROPERTIES = {
  ranch: {
    id: 'ranch',
    name: 'The Ranch House',
    address: '270 East Center Street, Lindon, Utah 84042',
    cleaningFee: 350,
    accentColor: 'bg-blue-500',
    mortgage: 3133.36,
    status: 'active' as const,
  },
  lindon: {
    id: 'lindon',
    name: 'The Lindon House',
    address: '143 Harcliff Circle, Lindon, Utah 84042',
    cleaningFee: 160,
    accentColor: 'bg-emerald-500',
    mortgage: 1265.14,
    status: 'active' as const,
  },
  river: {
    id: 'river',
    name: 'The River House',
    address: 'Vivian Park, Provo Canyon, Utah 84604',
    cleaningFee: 0,
    accentColor: 'bg-cyan-500',
    mortgage: 0,
    status: 'active' as const,
  },
  construction: {
    id: 'construction',
    name: 'Construction Project',
    address: 'Lindon, Utah 84042',
    cleaningFee: 0,
    accentColor: 'bg-amber-500',
    mortgage: 0,
    status: 'under_construction' as const,
  },
} as const;

export type PropertyId = keyof typeof PROPERTIES;
export type RentalPropertyId = 'ranch' | 'lindon' | 'river';

export const RENTAL_PROPERTY_IDS: RentalPropertyId[] = ['ranch', 'lindon', 'river'];

/** 50/50 Brandon–Todd after a 20% management fee to Brandon. Losses after the fee are split the same way (negative shares). */
export const OWNER_SPLIT_PROPERTY_IDS: RentalPropertyId[] = ['ranch', 'river'];

export function isRentalProperty(id: string): id is RentalPropertyId {
  return id === 'ranch' || id === 'lindon' || id === 'river';
}

/** Host-net after Airbnb/VRBO taxes and fees (what we keep). Dates match Hospitable iCal. */
export const RESERVATIONS = [
  { id: 'r1', guestName: "Kristin's Group", propertyId: 'ranch', checkIn: '2026-01-15', checkOut: '2026-01-19', payout: 2232.94, source: 'Airbnb' },
  { id: 'r2', guestName: "Andrew's Group", propertyId: 'ranch', checkIn: '2026-01-25', checkOut: '2026-01-28', payout: 1613.73, source: 'Airbnb' },
  { id: 'r3', guestName: 'Stacey Lucas', propertyId: 'ranch', checkIn: '2026-02-04', checkOut: '2026-03-02', payout: 11236.08, source: 'VRBO', guestPhone: '+12036870189' },
  { id: 'r4', guestName: 'Bryan Murray', propertyId: 'ranch', checkIn: '2026-03-05', checkOut: '2026-03-09', payout: 1505.73, source: 'VRBO', guestPhone: '+13603330730' },
  { id: 'r5', guestName: "Blake's Group", propertyId: 'ranch', checkIn: '2026-03-11', checkOut: '2026-03-15', payout: 2303.75, source: 'Airbnb' },
  { id: 'r6', guestName: "Zach's Group", propertyId: 'ranch', checkIn: '2026-03-24', checkOut: '2026-03-27', payout: 1813.37, source: 'Airbnb' },
  { id: 'r7', guestName: 'Kal Preece', propertyId: 'ranch', checkIn: '2026-04-01', checkOut: '2026-04-05', payout: 1509.27, source: 'Airbnb' },
  { id: 'r8', guestName: 'Adam Davis', propertyId: 'ranch', checkIn: '2026-04-15', checkOut: '2026-04-19', payout: 2228.09, source: 'Airbnb' },
  { id: 'r9', guestName: 'Michele Rodgers Spears', propertyId: 'ranch', checkIn: '2026-04-22', checkOut: '2026-04-26', payout: 2080.65, source: 'Airbnb' },
  { id: 'r10', guestName: 'Danette McLane', propertyId: 'ranch', checkIn: '2026-04-27', checkOut: '2026-05-02', payout: 2696.6, source: 'Airbnb' },
  { id: 'r11', guestName: 'Mario Hernandez', propertyId: 'ranch', checkIn: '2026-05-02', checkOut: '2026-05-03', payout: 659.34, source: 'Airbnb', guestPhone: '+14353148105' },
  { id: 'r12', guestName: 'Savanna Enriquez', propertyId: 'ranch', checkIn: '2026-05-07', checkOut: '2026-05-10', payout: 1553.47, source: 'VRBO' },
  { id: 'r13', guestName: 'Alyson Weaver', propertyId: 'ranch', checkIn: '2026-05-13', checkOut: '2026-05-17', payout: 2319.52, source: 'Airbnb' },
  { id: 'r14', guestName: 'Pam Boyd', propertyId: 'ranch', checkIn: '2026-05-19', checkOut: '2026-05-28', payout: 3871.15, source: 'VRBO', guestPhone: '+14703980236' },
  { id: 'r15', guestName: 'Becky Dolin', propertyId: 'ranch', checkIn: '2026-05-28', checkOut: '2026-06-02', payout: 2952.99, source: 'VRBO', guestPhone: '+19168037764' },
  { id: 'r16', guestName: 'Cyndi Schmitz', propertyId: 'ranch', checkIn: '2026-06-04', checkOut: '2026-06-07', payout: 2601.54, source: 'Airbnb' },
  { id: 'r17', guestName: 'David Secrist', propertyId: 'ranch', checkIn: '2026-06-11', checkOut: '2026-06-14', payout: 2295.26, source: 'VRBO', guestPhone: '+18012017082' },
  { id: 'r18', guestName: 'Karen Jarvis', propertyId: 'ranch', checkIn: '2026-06-17', checkOut: '2026-06-22', payout: 3796.58, source: 'Airbnb' },
  { id: 'r19', guestName: 'Debi Pythian', propertyId: 'ranch', checkIn: '2026-06-23', checkOut: '2026-06-30', payout: 2869.18, source: 'VRBO', guestPhone: '+16206404262' },
  { id: 'r20', guestName: 'Erin Rigby', propertyId: 'ranch', checkIn: '2026-07-01', checkOut: '2026-07-04', payout: 2320.37, source: 'Airbnb', guestPhone: '+15098422294' },
  { id: 'r-norah', guestName: 'Norah Lusk', propertyId: 'ranch', checkIn: '2026-07-08', checkOut: '2026-07-12', payout: 2995.52, source: 'Airbnb', guestPhone: '+17753401088' },
  { id: 'r-everardo', guestName: 'Everardo Jimenez', propertyId: 'ranch', checkIn: '2026-07-14', checkOut: '2026-07-20', payout: 3119.42, source: 'Airbnb', guestPhone: '+16825589928' },
  { id: 'r21', guestName: 'Nathan Wheeler', propertyId: 'ranch', checkIn: '2026-07-21', checkOut: '2026-07-26', payout: 3612.36, source: 'VRBO', guestPhone: '+19282432645' },
  { id: 'r22', guestName: 'Glen France', propertyId: 'ranch', checkIn: '2026-07-28', checkOut: '2026-08-02', payout: 3948.87, source: 'Airbnb' },
  { id: 'r23', guestName: 'Somer Cornell', propertyId: 'ranch', checkIn: '2026-08-06', checkOut: '2026-08-09', payout: 1965.3, source: 'VRBO', guestPhone: '+17023017674' },
  { id: 'r-jeff', guestName: 'Jeff Lyon', propertyId: 'ranch', checkIn: '2026-08-14', checkOut: '2026-08-17', payout: 1709.43, source: 'VRBO', guestPhone: '+17027684030' },
  { id: 'r-jennifer', guestName: 'Jennifer Ann Christenson', propertyId: 'ranch', checkIn: '2026-08-18', checkOut: '2026-08-21', payout: 1760.13, source: 'Airbnb', guestPhone: '+13077666381' },
  { id: 'r-jorge', guestName: 'Jorge Zendejas', propertyId: 'ranch', checkIn: '2026-08-27', checkOut: '2026-08-30', payout: 1709.43, source: 'VRBO', guestEmail: 'jorzendejas1@yahoo.com', guestPhone: '+15415089991' },
  { id: 'r-erika', guestName: 'Erika Mouritsen', propertyId: 'ranch', checkIn: '2026-09-03', checkOut: '2026-09-07', payout: 2319.52, source: 'Airbnb' },
  { id: 'r24', guestName: 'Michael White', propertyId: 'ranch', checkIn: '2026-09-17', checkOut: '2026-09-20', payout: 1553.47, source: 'VRBO', guestPhone: '+15087457389' },
  { id: 'r25', guestName: 'Chloe Meyer', propertyId: 'ranch', checkIn: '2026-09-24', checkOut: '2026-09-28', payout: 2503.57, source: 'Airbnb' },
  { id: 'r-shelly', guestName: 'Shelly Terry', propertyId: 'ranch', checkIn: '2026-10-08', checkOut: '2026-10-11', payout: 1939.27, source: 'Airbnb', guestPhone: '+18017194989' },
  { id: 'r26', guestName: 'Melanie St Clair', propertyId: 'ranch', checkIn: '2026-10-14', checkOut: '2026-10-18', payout: 2319.52, source: 'Airbnb', guestPhone: '+18015897000' },
  { id: 'r-susan', guestName: 'Susan Davis', propertyId: 'ranch', checkIn: '2026-11-25', checkOut: '2026-11-29', payout: 2319.52, source: 'Airbnb' },
  { id: 'r27', guestName: 'Rick Harrison', propertyId: 'ranch', checkIn: '2026-12-18', checkOut: '2026-12-21', payout: 1553.47, source: 'VRBO' },
  { id: 'r-russell', guestName: 'Russell Jackson', propertyId: 'ranch', checkIn: '2026-12-23', checkOut: '2026-12-26', payout: 1937.19, source: 'VRBO', guestEmail: 'rjack@frontiernet.net', guestPhone: '+14352530332' },
  { id: 'r-tyson', guestName: 'Tyson Kaiser', propertyId: 'ranch', checkIn: '2026-12-30', checkOut: '2027-01-03', payout: 2430.9, source: 'VRBO', guestEmail: 'tkguitarman@gmail.com', guestPhone: '+17203082028' },
  { id: 'r-tracy', guestName: 'Tracy Bailey', propertyId: 'ranch', checkIn: '2027-06-12', checkOut: '2027-06-19', payout: 3483.68, source: 'Airbnb' },
  { id: 'r-andrea', guestName: 'Andrea Hernandez', propertyId: 'ranch', checkIn: '2027-07-15', checkOut: '2027-07-18', payout: 2150.52, source: 'Airbnb', guestPhone: '+15305145461' },
  { id: 'l1', guestName: 'Kim Smelcer', propertyId: 'lindon', checkIn: '2026-01-04', checkOut: '2026-01-17', payout: 1811.12, source: 'VRBO' },
  { id: 'l2', guestName: 'Robert Koop', propertyId: 'lindon', checkIn: '2026-01-29', checkOut: '2026-02-02', payout: 682.27, source: 'VRBO', guestPhone: '+19495847667' },
  { id: 'l3', guestName: "Jacob's Group", propertyId: 'lindon', checkIn: '2026-02-06', checkOut: '2026-02-09', payout: 580.06, source: 'Airbnb' },
  { id: 'l4', guestName: "Shawn's Group", propertyId: 'lindon', checkIn: '2026-02-13', checkOut: '2026-02-16', payout: 580.06, source: 'Airbnb' },
  { id: 'l5', guestName: "Scott's Group", propertyId: 'lindon', checkIn: '2026-02-21', checkOut: '2026-02-25', payout: 726.53, source: 'Airbnb' },
  { id: 'l6', guestName: 'Chase Dowling', propertyId: 'lindon', checkIn: '2026-03-06', checkOut: '2026-03-09', payout: 425.49, source: 'Airbnb' },
  { id: 'l7', guestName: 'Quincy McKinney', propertyId: 'lindon', checkIn: '2026-03-21', checkOut: '2026-03-29', payout: 1185.15, source: 'Airbnb' },
  { id: 'l8', guestName: 'Amber Pearce', propertyId: 'lindon', checkIn: '2026-04-01', checkOut: '2026-04-06', payout: 622.02, source: 'Airbnb' },
  { id: 'l9', guestName: 'Meredyth Grover', propertyId: 'lindon', checkIn: '2026-04-09', checkOut: '2026-04-12', payout: 545.83, source: 'VRBO', guestPhone: '+18013621923' },
  { id: 'l10', guestName: 'Andrew Crain', propertyId: 'lindon', checkIn: '2026-04-14', checkOut: '2026-04-17', payout: 405.06, source: 'Airbnb', guestPhone: '+18178768885' },
  { id: 'l11', guestName: 'Jason Bylund', propertyId: 'lindon', checkIn: '2026-04-22', checkOut: '2026-04-25', payout: 504.89, source: 'VRBO', guestPhone: '+18595598093' },
  { id: 'l12', guestName: 'Abby Warden', propertyId: 'lindon', checkIn: '2026-04-26', checkOut: '2026-05-01', payout: 788.25, source: 'Airbnb', guestPhone: '+14349873902' },
  { id: 'l13', guestName: 'Lora Gardner', propertyId: 'lindon', checkIn: '2026-05-01', checkOut: '2026-05-04', payout: 504.89, source: 'VRBO' },
  { id: 'l14', guestName: 'Heather Stotts', propertyId: 'lindon', checkIn: '2026-05-05', checkOut: '2026-05-09', payout: 867.18, source: 'Airbnb' },
  { id: 'l15', guestName: 'Kristen Gasaway', propertyId: 'lindon', checkIn: '2026-05-09', checkOut: '2026-05-13', payout: 654.98, source: 'VRBO', guestPhone: '+17815720827' },
  { id: 'l16', guestName: 'Matthew Cox', propertyId: 'lindon', checkIn: '2026-05-14', checkOut: '2026-05-17', payout: 657.54, source: 'VRBO', guestPhone: '+16169153777' },
  { id: 'l17', guestName: 'Bryce Crabbs', propertyId: 'lindon', checkIn: '2026-05-22', checkOut: '2026-05-25', payout: 687.77, source: 'VRBO', guestPhone: '+16023968066' },
  { id: 'l18', guestName: 'Tyneshia Word', propertyId: 'lindon', checkIn: '2026-05-28', checkOut: '2026-06-01', payout: 627.69, source: 'VRBO', guestPhone: '+19072310953' },
  { id: 'l19', guestName: 'serenity post-jones', propertyId: 'lindon', checkIn: '2026-06-04', checkOut: '2026-06-08', payout: 838.32, source: 'VRBO', guestPhone: '+18015929000' },
  { id: 'l20', guestName: 'Todd Meyers', propertyId: 'lindon', checkIn: '2026-06-09', checkOut: '2026-06-14', payout: 1282.71, source: 'Airbnb' },
  { id: 'l-anjanette', guestName: 'Anjanette Viehweg', propertyId: 'lindon', checkIn: '2026-06-16', checkOut: '2026-06-20', payout: 910.4, source: 'VRBO', guestPhone: '+12088991846' },
  { id: 'l21', guestName: 'Matthew Simon', propertyId: 'lindon', checkIn: '2026-06-22', checkOut: '2026-06-26', payout: 840.8, source: 'VRBO', guestPhone: '+12314992382' },
  { id: 'l22', guestName: 'Shanda Evans', propertyId: 'lindon', checkIn: '2026-06-29', checkOut: '2026-07-06', payout: 1192.59, source: 'VRBO', guestPhone: '+12103150731' },
  { id: 'l-argyle', guestName: 'Matthew Argyle', propertyId: 'lindon', checkIn: '2026-07-06', checkOut: '2026-07-11', payout: 1331.72, source: 'Airbnb', guestPhone: '+14085934326' },
  { id: 'l-herzog', guestName: 'William Herzog', propertyId: 'lindon', checkIn: '2026-07-15', checkOut: '2026-07-20', payout: 1097.13, source: 'VRBO' },
  { id: 'l-wheeler', guestName: 'Nathan Wheeler', propertyId: 'lindon', checkIn: '2026-07-21', checkOut: '2026-07-26', payout: 993.37, source: 'VRBO', guestPhone: '+19282432645' },
  { id: 'l-neva', guestName: 'Neva Westhoff', propertyId: 'lindon', checkIn: '2026-07-26', checkOut: '2026-08-02', payout: 1304.84, source: 'VRBO', guestPhone: '+15735280919' },
  { id: 'l-jake', guestName: 'Jake Maughan', propertyId: 'lindon', checkIn: '2026-08-06', checkOut: '2026-08-09', payout: 732.64, source: 'VRBO', guestPhone: '+12084032057' },
  { id: 'l23', guestName: 'Doeeen Gardner', propertyId: 'lindon', checkIn: '2026-08-13', checkOut: '2026-08-17', payout: 1110.65, source: 'Airbnb' },
  { id: 'l-joanne', guestName: 'Joanne OHara', propertyId: 'lindon', checkIn: '2026-09-03', checkOut: '2026-09-06', payout: 729.24, source: 'Airbnb', guestPhone: '+16614005943' },
  { id: 'l-debra', guestName: 'Debra Adimey', propertyId: 'lindon', checkIn: '2026-08-18', checkOut: '2026-08-21', payout: 0, source: 'Airbnb', guestPhone: '+17023764054', note: 'HA-PGD5TF · 9 guests · host payout not in confirmation' },
  { id: 'l-laura', guestName: 'Laura Mullis', propertyId: 'lindon', checkIn: '2026-08-20', checkOut: '2026-08-28', payout: 0, source: 'Airbnb', guestPhone: '+19122931122', note: 'HMTJ9SR2SF · 2 guests · overlaps Debra Aug 18–21 — confirm if one cancelled' },
  { id: 'l-marcy', guestName: 'Marcy Eckmier', propertyId: 'lindon', checkIn: '2026-10-07', checkOut: '2026-10-11', payout: 0, source: 'VRBO', guestPhone: '+15109109739', note: '5441941976 · 6 guests · host payout not in confirmation' },
  { id: 'l25', guestName: 'Jason Parkin', propertyId: 'lindon', checkIn: '2026-11-22', checkOut: '2026-11-29', payout: 1299.78, source: 'Airbnb' },
  {
    id: 'rh-melanie',
    guestName: 'Melanie Larisch',
    propertyId: 'river',
    checkIn: '2026-12-10',
    checkOut: '2026-12-13',
    payout: 5016,
    source: 'VRBO',
    guestEmail: 'lar.memo68@gmail.com',
    guestPhone: '+18015805653',
    note: 'HA-W4X608 · 18 adults · first Riverhouse booking · booked as Melanie Jackson · estimated host payout $4,837.14',
  },
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
  propId: RentalPropertyId,
  currentMonth: string,
  extraCleaningFees: Record<string, number> = DEFAULT_EXTRA_CLEANING,
  expenseList: Array<{ propertyId: string; month: string; category: string; amount: number }> = EXPENSES,
  reservationList: Array<{
    propertyId: string;
    checkIn: string;
    checkOut: string;
    payout: number;
    status?: string;
  }> = RESERVATIONS,
) {
  let revenue = 0;
  let occupied = 0;
  let stayCount = 0;

  const stays = reservationList.filter(
    (r) => r.propertyId === propId && r.status !== 'cancelled' && r.status !== 'blocked',
  );

  for (const res of stays) {
    if (res.checkIn.startsWith(currentMonth)) {
      revenue += Number(res.payout) || 0;
      stayCount++;
    }
    occupied += getOverlappingNights(res.checkIn, res.checkOut, currentMonth);
  }

  const extra = Number(extraCleaningFees[`${propId}-${currentMonth}`] || 0);
  const cleaningExpenses = expenseList
    .filter((e) => e.propertyId === propId && e.month === currentMonth && e.category === 'Cleaning')
    .reduce((sum, e) => sum + e.amount, 0);
  const baseCleaning =
    cleaningExpenses > 0 ? cleaningExpenses : stayCount * PROPERTIES[propId].cleaningFee;
  const totalCleaning = baseCleaning + extra;
  const mortgage = PROPERTIES[propId].mortgage;
  const operationalExpenses = expenseList
    .filter(
      (e) =>
        e.propertyId === propId &&
        e.month === currentMonth &&
        e.category !== 'Mortgage' &&
        e.category !== 'Cleaning',
    )
    .reduce((sum, e) => sum + e.amount, 0);
  const [yearStr, monthStr] = currentMonth.split('-');
  const days = new Date(Number(yearStr), Number(monthStr), 0).getDate();
  const profit = revenue - (mortgage + totalCleaning + operationalExpenses);

  let dist = null;
  if (OWNER_SPLIT_PROPERTY_IDS.includes(propId)) {
    const basis = revenue - totalCleaning;
    const mgtFee = basis > 0 ? basis * 0.2 : 0;
    const leftover = basis - mgtFee - (mortgage + operationalExpenses);
    const share = leftover / 2;
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

/** River House first stays Oct 15, 2026 — omit it from portfolio occupancy until then. */
export const RIVER_OPEN_MONTH = '2026-10';

export function portfolioAvgOccupancy(
  month: string,
  ranchOcc: number,
  lindonOcc: number,
  riverOcc: number,
): number {
  if (month >= RIVER_OPEN_MONTH) {
    return (ranchOcc + lindonOcc + riverOcc) / 3;
  }
  return (ranchOcc + lindonOcc) / 2;
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
    'Access-Control-Allow-Methods': 'GET, PUT, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    ...extraHeaders,
  };
  if (status === 204) return new Response(null, { status, headers });
  return new Response(JSON.stringify(data), { status, headers });
}
