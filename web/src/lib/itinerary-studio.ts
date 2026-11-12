import { addDays, denverToday } from './market/dates';
import type { HouseId } from './market/types';
import { computeMountainLight } from './mountain-alpenglow';

export type ItineraryTrackId =
  | 'ski-sauna'
  | 'river-trails'
  | 'summer-lake'
  | 'reunion-celebration'
  | 'work-retreat';

export type ItineraryStop = {
  slot: 'Morning' | 'Midday' | 'Afternoon' | 'Evening';
  timeHint: string;
  title: string;
  detail: string;
};

export type ItineraryDayPlan = {
  dayNumber: number;
  dateIso: string;
  dateLabel: string;
  headline: string;
  alpenglowSummary: string | null;
  stops: ItineraryStop[];
};

export type ItineraryTrackMeta = {
  id: ItineraryTrackId;
  label: string;
  seasonTag: string;
  summary: string;
};

export const CURATED_TRACKS: readonly ItineraryTrackMeta[] = [
  {
    id: 'ski-sauna',
    label: 'Ski & Alpine Wellness',
    seasonTag: 'Winter',
    summary: 'Sundance Mountain Resort runs, Foundry Grill lunch, and fireside hot-tub or sauna evenings.',
  },
  {
    id: 'river-trails',
    label: 'Provo River & Trails',
    seasonTag: 'Spring · Fall',
    summary: 'Morning trout water at Vivian Park, Bridal Veil Falls trail walk, and Mount Timpanogos alpenglow.',
  },
  {
    id: 'summer-lake',
    label: 'Summer Lake & Pool',
    seasonTag: 'Summer',
    summary: 'Lindon Aquatics Center slides, Deer Creek Reservoir boating, and pergola or patio dinners.',
  },
  {
    id: 'reunion-celebration',
    label: 'Reunion & Venues',
    seasonTag: 'Year-round',
    summary: 'Group breakfasts, Walker Farms / Wadley Farms / BYU outings, and game-room evenings.',
  },
  {
    id: 'work-retreat',
    label: 'Executive Retreat',
    seasonTag: 'Year-round',
    summary: 'Focused morning strategy blocks, canyon trail reset, and chef-style group dinners.',
  },
];

export const ITINERARY_TRACKS: readonly ItineraryTrackMeta[] = CURATED_TRACKS;

function houseEveningWellness(house: HouseId): { title: string; detail: string } {
  if (house === 'river') {
    return {
      title: 'Hot tub, barrel sauna & river soundscape',
      detail: 'Alternate between the outdoor barrel sauna and hot tub beside the Provo River before quiet hours at 10:00 PM.',
    };
  }
  if (house === 'ranch') {
    return {
      title: 'Pergola hot tub, fire pit & game room',
      detail: 'Soak under the lit timber pergola, gather around the gas fire pit, then head downstairs for pool, arcade, and theater night.',
    };
  }
  return {
    title: 'Stone fireplace & Timpanogos twilight',
    detail: 'Unwind on the private bistro balcony and gather around the floor-to-ceiling stone fireplace in the living room.',
  };
}

function formatLongIso(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function buildDayStops(house: HouseId, track: ItineraryTrackId, dayIndex: number, goldenHour: string | null): { headline: string; stops: ItineraryStop[] } {
  const wellness = houseEveningWellness(house);
  const sunsetHint = goldenHour ? `Alpenglow ~${goldenHour}` : '6:30 PM';

  if (track === 'ski-sauna') {
    const dayTemplates = [
      {
        headline: 'Arrival, Sundance Recon & Fireside Welcome',
        stops: [
          { slot: 'Morning' as const, timeHint: '10:30 AM', title: 'Valley provisions at Riverwoods or Harmons', detail: 'Stock coffee, breakfast items, and apres-ski snacks at the mouth of Provo Canyon before heading to the house.' },
          { slot: 'Midday' as const, timeHint: '1:00 PM', title: 'Lunch at Foundry Grill at Sundance', detail: 'Wood-fired canyon lunch beneath Mount Timpanogos before 4:00 PM check-in.' },
          { slot: 'Afternoon' as const, timeHint: '4:00 PM', title: 'Check-in & gear staging', detail: house === 'river' ? 'Settle into the suites and stage skis in the heated garage.' : 'Settle into the bedrooms and warm up the fireplace for the group.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: wellness.title, detail: wellness.detail },
        ],
      },
      {
        headline: 'First Chair on Outlaw Express & Owl Bar Apres',
        stops: [
          { slot: 'Morning' as const, timeHint: '8:15 AM', title: 'Coffee & hot breakfast around the kitchen island', detail: 'Fuel up at the house before the drive to Sundance base.' },
          { slot: 'Midday' as const, timeHint: '9:00 AM', title: 'Morning laps on Outlaw Express & Red’s Lift', detail: 'Cruise groomers and bowls with zero mega-resort lift lines.' },
          { slot: 'Afternoon' as const, timeHint: '3:30 PM', title: 'Apres at the historic 1890s Owl Bar', detail: 'Gather around the restored Rosewood bar at Sundance Village after the lifts spin down.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: 'Group dinner at Communal or Tree Room', detail: 'Long-table seasonal Utah dining followed by fireside board games back at the house.' },
        ],
      },
      {
        headline: 'Nordic Snowshoeing, Art Studio & Cozy Night In',
        stops: [
          { slot: 'Morning' as const, timeHint: '9:30 AM', title: 'Sundance Nordic Center snowshoe or cross-country', detail: 'Glide through quiet aspen groves in upper North Fork Canyon.' },
          { slot: 'Midday' as const, timeHint: '12:30 PM', title: 'Oteo or Black Sheep Cafe lunch', detail: 'Drive down the canyon for modern Mexican in Lindon or Southwestern comfort in Provo.' },
          { slot: 'Afternoon' as const, timeHint: '2:30 PM', title: 'Sundance Art Studio or spa afternoon', detail: 'Pottery, glassblowing, or jewelry workshop in the village.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: 'Chef-style dinner in the house kitchen', detail: house === 'river' ? 'Cook together across the two kitchens and dine at the main lodge table.' : 'Cook a family feast at the island and gather in the dining room.' },
        ],
      },
      {
        headline: 'Final Canyon Morning & Easy Departure',
        stops: [
          { slot: 'Morning' as const, timeHint: '8:30 AM', title: 'Sunrise coffee & pastry run to Eleve', detail: 'Pick up fresh croissants and espresso while packing bags.' },
          { slot: 'Midday' as const, timeHint: '11:00 AM', title: 'Smooth 11:00 AM checkout & scenic stop', detail: 'Pause at Bridal Veil Falls overlook on your drive back toward SLC or Provo Airport.' },
        ],
      },
    ];
    return dayTemplates[Math.min(dayIndex, dayTemplates.length - 1)]!;
  }

  if (track === 'river-trails') {
    const dayTemplates = [
      {
        headline: 'Provo Canyon Arrival & Bridal Veil Stroll',
        stops: [
          { slot: 'Morning' as const, timeHint: '11:00 AM', title: 'Walk to the base of Bridal Veil Falls', detail: 'Stretch your legs along the paved Provo River Parkway beneath the 607-foot double waterfall.' },
          { slot: 'Midday' as const, timeHint: '1:00 PM', title: 'Patio lunch at Shops at Riverwoods', detail: 'Grab lunch and outfitters gear at the canyon mouth.' },
          { slot: 'Afternoon' as const, timeHint: '4:00 PM', title: 'Check-in & canyon golden hour', detail: house === 'river' ? 'Walk out onto the riverfront at Vivian Park as canyon shadows lengthen.' : 'Settle into the house and enjoy views of Mount Timpanogos.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: wellness.title, detail: wellness.detail },
        ],
      },
      {
        headline: 'Morning Trout Hatch & Heber Valley Loop',
        stops: [
          { slot: 'Morning' as const, timeHint: '7:30 AM', title: 'Blue-ribbon fly-fishing on the Lower Provo', detail: 'Cast dry flies and nymphs on the Vivian Park stretch — check the live USGS cfs gauge at the top of this page.' },
          { slot: 'Midday' as const, timeHint: '12:30 PM', title: 'Midway & Heber Valley bakery lunch', detail: 'Drive 15 minutes past Deer Creek Reservoir to Midway for Swiss-inspired bakeries and Homestead Crater.' },
          { slot: 'Afternoon' as const, timeHint: '3:00 PM', title: 'E-bike or walk the Provo River Parkway', detail: 'Cruise the paved canyon trail hugging the river through shaded cottonwoods.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: 'Wood-fired pizza at Pizzeria 712 + Rockwell Ice Cream', detail: 'Local Utah ingredients in Orem/Provo before returning for stargazing.' },
        ],
      },
      {
        headline: 'Alpine Loop Scenic Overlooks & Timpanogos Cave',
        stops: [
          { slot: 'Morning' as const, timeHint: '9:00 AM', title: 'Stewart Falls or Sundance scenic lift hike', detail: 'Walk through pine and aspen trails to the two-tiered waterfall.' },
          { slot: 'Midday' as const, timeHint: '1:00 PM', title: 'Picnic at Vivian Park riverside lawn', detail: 'Relax under towering canyon trees beside the Heber Valley Railroad tracks.' },
          { slot: 'Afternoon' as const, timeHint: '4:00 PM', title: 'Afternoon rest & house games', detail: 'Unplug with cards, books, or arcade/pool back at the house.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: wellness.title, detail: wellness.detail },
        ],
      },
      {
        headline: 'Riverside Coffee & Departure',
        stops: [
          { slot: 'Morning' as const, timeHint: '8:30 AM', title: 'Quiet morning coffee & pack-up', detail: 'Enjoy one last crisp Utah mountain morning before 11:00 AM checkout.' },
          { slot: 'Midday' as const, timeHint: '11:30 AM', title: 'Brunch at Oteo in Lindon', detail: 'Chilaquiles and cafe de olla right off I-15 on your way north to SLC.' },
        ],
      },
    ];
    return dayTemplates[Math.min(dayIndex, dayTemplates.length - 1)]!;
  }

  if (track === 'summer-lake') {
    const dayTemplates = [
      {
        headline: 'Poolside Afternoon & Backyard Pergola Night',
        stops: [
          { slot: 'Morning' as const, timeHint: '11:30 AM', title: 'Lindon Aquatics Center splash session', detail: house === 'lindon' ? 'Walk right across Harcliff Circle in 30 seconds to the lazy river, slides, and FlowRider.' : 'A quick drive to Lindon Aquatics Center for slides, lap lanes, and the FlowRider surf wave.' },
          { slot: 'Midday' as const, timeHint: '2:00 PM', title: 'Lunch & grocery stock-up', detail: 'Pick up barbecue provisions, fruit, and cold drinks for the house.' },
          { slot: 'Afternoon' as const, timeHint: '4:00 PM', title: '4:00 PM check-in & yard games', detail: 'Spread out across the bedrooms and enjoy the shaded patio or fenced yard.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: wellness.title, detail: wellness.detail },
        ],
      },
      {
        headline: 'Deer Creek Reservoir Boating & Canyon Breeze',
        stops: [
          { slot: 'Morning' as const, timeHint: '9:00 AM', title: 'Paddleboarding or wake-surfing at Deer Creek', detail: 'Glassy morning water framed by the back side of Mount Timpanogos.' },
          { slot: 'Midday' as const, timeHint: '1:00 PM', title: 'Canyon burger & shake stop', detail: 'Cool off along the Provo River shaded picnic areas at Vivian Park.' },
          { slot: 'Afternoon' as const, timeHint: '3:30 PM', title: 'Sundance ZipTour or summer chairlift', detail: 'Soar above the canyon wildflowers with panoramic views of Utah Valley.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: 'Barbecue dinner & Rockwell ice cream run', detail: 'Grill outside in the cool mountain evening air.' },
        ],
      },
      {
        headline: 'Thanksgiving Point Gardens & Family Movie Night',
        stops: [
          { slot: 'Morning' as const, timeHint: '9:30 AM', title: 'Ashton Gardens or Museum of Ancient Life', detail: '55 acres of botanical gardens and dinosaur exhibits 20 minutes north in Lehi.' },
          { slot: 'Midday' as const, timeHint: '1:00 PM', title: 'Lunch at Strap Tank or Slackwater', detail: 'Local craft sodas, wood-fired pizzas, and patio seating.' },
          { slot: 'Afternoon' as const, timeHint: '4:00 PM', title: 'Afternoon relax & nap window', detail: 'Cool air-conditioned bedrooms for kids and grandparents before dinner.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: wellness.title, detail: wellness.detail },
        ],
      },
      {
        headline: 'Sunny Patio Breakfast & Checkout',
        stops: [
          { slot: 'Morning' as const, timeHint: '8:30 AM', title: 'Pancakes at the island & easy 11:00 AM checkout', detail: 'Load up the driveway with plenty of room for luggage and coolers.' },
        ],
      },
    ];
    return dayTemplates[Math.min(dayIndex, dayTemplates.length - 1)]!;
  }

  if (track === 'reunion-celebration') {
    const dayTemplates = [
      {
        headline: 'Everyone Arrives & Welcome Dinner',
        stops: [
          { slot: 'Afternoon' as const, timeHint: '4:00 PM', title: '4:00 PM check-in — real beds for every generation', detail: 'Assign king suites to adults and grandparents while cousins claim the bunk rooms.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: 'Welcome taco or pasta bar at the island', detail: house === 'river' ? 'Use the second kitchen in the recreation wing for effortless catering prep.' : 'Gather the whole family around the dining room table and patio.' },
        ],
      },
      {
        headline: 'Venue / BYU Outing & Family Tournament Night',
        stops: [
          { slot: 'Morning' as const, timeHint: '9:00 AM', title: 'Big family breakfast & group photos', detail: 'Golden morning light against Mount Timpanogos or along the Provo River.' },
          { slot: 'Midday' as const, timeHint: '12:00 PM', title: 'Walker Farms, Wadley Farms, or BYU Campus', detail: 'Minutes from Utah Valley’s signature wedding venues, museums, and stadium.' },
          { slot: 'Afternoon' as const, timeHint: '3:30 PM', title: 'Canyon scenic drive to Bridal Veil Falls', detail: 'Easy paved walk accessible for strollers and grandparents alike.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: 'House game-room championship & hot tub', detail: house === 'ranch' ? '8-ball pool, stand-up arcade high scores, and theater movie marathon downstairs.' : wellness.detail },
        ],
      },
      {
        headline: 'Slow Sunday / Rest Day Together',
        stops: [
          { slot: 'Morning' as const, timeHint: '9:30 AM', title: 'Unhurried brunch & fireplace conversation', detail: 'Note that many Utah Valley local shops pause on Sundays — stock Sunday brunch favorites ahead of time.' },
          { slot: 'Afternoon' as const, timeHint: '2:00 PM', title: 'Lawn games, puzzles & canyon air', detail: 'Zero-agenda afternoon together where nobody has to rush back to separate hotel rooms.' },
          { slot: 'Evening' as const, timeHint: sunsetHint, title: wellness.title, detail: wellness.detail },
        ],
      },
      {
        headline: 'Farewell Coffee & Airport Send-Off',
        stops: [
          { slot: 'Morning' as const, timeHint: '9:00 AM', title: 'Leftovers breakfast & 11:00 AM checkout', detail: 'Smooth freeway shot to PVU (~18–28 min) or SLC International (~44–56 min).' },
        ],
      },
    ];
    return dayTemplates[Math.min(dayIndex, dayTemplates.length - 1)]!;
  }

  // work-retreat
  const retreatTemplates = [
    {
      headline: 'Arrival, Fireside Kickoff & Strategy Dinner',
      stops: [
        { slot: 'Afternoon' as const, timeHint: '4:00 PM', title: 'Arrival from Silicon Slopes or SLC Int’l', detail: house === 'river' ? 'Plug EVs into the three on-site chargers and settle into private king suites.' : 'Off-street parking for the whole leadership team and private king bedrooms.' },
        { slot: 'Evening' as const, timeHint: sunsetHint, title: 'Fireside kickoff & catered dinner', detail: 'Set the week’s objectives in the great room or living room, followed by a relaxed group meal.' },
      ],
    },
    {
      headline: 'Deep-Work Sprint & Provo Canyon Trail Reset',
      stops: [
        { slot: 'Morning' as const, timeHint: '8:30 AM', title: 'Morning architecture & product sprint', detail: 'Break out across the dining table, dedicated workspace, and living areas on fast Wi-Fi.' },
        { slot: 'Midday' as const, timeHint: '12:30 PM', title: 'Working lunch or Oteo takeout', detail: 'Keep momentum without restaurant wait times.' },
        { slot: 'Afternoon' as const, timeHint: '3:00 PM', title: 'Canyon trail walk or Sundance lift ride', detail: 'Step away from screens into 5,200+ ft mountain air along the Provo River.' },
        { slot: 'Evening' as const, timeHint: sunsetHint, title: wellness.title, detail: wellness.detail },
      ],
    },
    {
      headline: 'Roadmap Alignment & Celebration Dinner',
      stops: [
        { slot: 'Morning' as const, timeHint: '9:00 AM', title: 'Decision review & Q&A session', detail: 'Lock quarterly priorities and action owners.' },
        { slot: 'Afternoon' as const, timeHint: '2:00 PM', title: 'Guided fly-fishing or Sundance afternoon', detail: 'Unstructured team bonding in Provo Canyon.' },
        { slot: 'Evening' as const, timeHint: sunsetHint, title: 'Dinner at Tree Room or Communal', detail: 'Celebrate wins over seasonal Utah cuisine.' },
      ],
    },
    {
      headline: 'Wrap-Up Summary & Commute Home',
      stops: [
        { slot: 'Morning' as const, timeHint: '9:00 AM', title: '30-minute wrap-up & 11:00 AM checkout', detail: 'Head back to Lehi / Silicon Slopes or SLC Airport refreshed.' },
      ],
    },
  ];
  return retreatTemplates[Math.min(dayIndex, retreatTemplates.length - 1)]!;
}

export function generateUtahItinerary(input: {
  house: HouseId;
  track: ItineraryTrackId;
  days: 2 | 3 | 4;
  startDate?: string;
}): ItineraryDayPlan[] {
  const anchor =
    input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate)
      ? input.startDate
      : denverToday();

  const out: ItineraryDayPlan[] = [];
  for (let i = 0; i < input.days; i += 1) {
    const dateIso = addDays(anchor, i);
    const light = computeMountainLight(dateIso, input.house);
    const built = buildDayStops(input.house, input.track, i, light?.goldenHourStart ?? null);
    out.push({
      dayNumber: i + 1,
      dateIso,
      dateLabel: formatLongIso(dateIso),
      headline: built.headline,
      alpenglowSummary: light ? light.alpenglowLine : null,
      stops: built.stops,
    });
  }
  return out;
}

export function formatItineraryPlainText(
  houseName: string,
  trackLabel: string,
  plans: readonly ItineraryDayPlan[],
): string {
  const lines: string[] = [
    `${houseName} — ${trackLabel} Itinerary (Utah Mountain Luxury)`,
    'Planning guide from published local recommendations. Does not hold dates or quote a price.',
    '',
  ];
  for (const day of plans) {
    lines.push(`Day ${day.dayNumber} (${day.dateLabel}): ${day.headline}`);
    if (day.alpenglowSummary) {
      lines.push(`  Light: ${day.alpenglowSummary}`);
    }
    for (const stop of day.stops) {
      lines.push(`  • ${stop.slot} (${stop.timeHint}) — ${stop.title}: ${stop.detail}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function buildItineraryIcs(
  houseName: string,
  trackLabel: string,
  plans: readonly ItineraryDayPlan[],
): string {
  const stamp = '20261112T120000Z';
  const rows: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Utah Mountain Luxury//Concierge Itinerary//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];

  for (const day of plans) {
    const compactDate = day.dateIso.replace(/-/g, '');
    const nextCompact = addDays(day.dateIso, 1).replace(/-/g, '');
    const body = day.stops
      .map((s) => `${s.slot} (${s.timeHint}): ${s.title} — ${s.detail}`)
      .join('\n');

    rows.push(
      'BEGIN:VEVENT',
      `UID:uml-itinerary-${compactDate}-d${day.dayNumber}@utahmountainluxury`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate}`,
      `DTEND;VALUE=DATE:${nextCompact}`,
      `SUMMARY:${escapeIcs(`${houseName} · Day ${day.dayNumber}: ${day.headline}`)}`,
      `DESCRIPTION:${escapeIcs(`${trackLabel}\n${day.alpenglowSummary ? `${day.alpenglowSummary}\n\n` : ''}${body}\n\nNote: Personal trip plan only; does not change or hold a reservation.`)}`,
      'END:VEVENT',
    );
  }

  rows.push('END:VCALENDAR');
  return rows.join('\r\n');
}
