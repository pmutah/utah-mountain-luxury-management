import { SLEEPS, SLEEPS_TOGETHER } from './house-stay';
import { houseFacts, houseProfile } from './house-catalog';
import { TRAVEL_ORIGINS } from './canyon-map';
import type { HouseId } from './market/types';

export type TripArchetypeId = 'all' | 'reunion' | 'ski' | 'family-swim' | 'retreat' | 'compound';

export type TripArchetype = {
  id: TripArchetypeId;
  label: string;
  recommended: HouseId[];
  summary: string;
};

export const TRIP_ARCHETYPES: TripArchetype[] = [
  {
    id: 'all',
    label: 'Compare all three',
    recommended: ['river', 'ranch', 'lindon'],
    summary: 'Side-by-side layout, setting, wellness, entertainment, and drive times across the portfolio.',
  },
  {
    id: 'reunion',
    label: 'Family reunion & weddings',
    recommended: ['river', 'ranch'],
    summary: `Big dining tables, king-bed suites for adults, and bunk rooms for cousins — up to ${SLEEPS.river} in one lodge or ${SLEEPS_TOGETHER} across River + Ranch.`,
  },
  {
    id: 'ski',
    label: 'Ski Sundance & canyon fly-fishing',
    recommended: ['river'],
    summary: 'On the Provo River at Vivian Park — 10 minutes below Sundance lifts with a hot tub, barrel sauna, and heated garage.',
  },
  {
    id: 'family-swim',
    label: 'BYU, UVU & summer pool days',
    recommended: ['lindon', 'ranch'],
    summary: 'Walk across the street to the Lindon Aquatics Center at Lindon, or host a larger crowd with a private hot tub and game room at the Ranch.',
  },
  {
    id: 'retreat',
    label: 'Executive off-site & work retreat',
    recommended: ['river', 'ranch'],
    summary: 'Fast Wi-Fi, dedicated office/workspace, king suites so colleagues do not share beds, and two kitchens at the River House.',
  },
  {
    id: 'compound',
    label: `Two-house group (up to ${SLEEPS_TOGETHER})`,
    recommended: ['river', 'ranch'],
    summary: `Book the River House and Ranch House together on one direct request when your group outgrows a single roof (up to ${SLEEPS_TOGETHER} overnight guests).`,
  },
];

export type CompareSpecRow = {
  label: string;
  values: Record<HouseId, string>;
};

function factValue(house: HouseId, label: string): string {
  return houseFacts(house).find((row) => row.label === label)?.value ?? '—';
}

function slcMinutes(house: HouseId): number {
  const slc = TRAVEL_ORIGINS.find((origin) => origin.id === 'slc');
  return slc ? slc.minutesTo[house] : 45;
}

function sundanceMinutes(house: HouseId): number {
  const sundance = TRAVEL_ORIGINS.find((origin) => origin.id === 'sundance-origin');
  return sundance ? sundance.minutesTo[house] : 25;
}

/**
 * Side-by-side comparison rows built strictly from `SLEEPS`, `houseFacts`, `houseProfile`, and `TRAVEL_ORIGINS`
 * so sleep counts, bed counts, and policies never drift from the listing source of truth.
 */
export function buildHouseComparisonRows(): CompareSpecRow[] {
  return [
    {
      label: 'Overnight capacity',
      values: {
        river: `Up to ${SLEEPS.river} guests (whole or 3 wings)`,
        ranch: `Up to ${SLEEPS.ranch} guests`,
        lindon: `Up to ${SLEEPS.lindon} guests`,
      },
    },
    {
      label: 'Bedrooms & baths',
      values: {
        river: `${factValue('river', 'Bedrooms')} bedrooms · ${factValue('river', 'Baths')} baths`,
        ranch: `${factValue('ranch', 'Bedrooms')} bedrooms · ${factValue('ranch', 'Baths')} baths (incl. detached casita)`,
        lindon: `${factValue('lindon', 'Bedrooms')} bedrooms · ${factValue('lindon', 'Baths')} baths`,
      },
    },
    {
      label: 'Scale & setting',
      values: {
        river: houseProfile('river').scale,
        ranch: houseProfile('ranch').scale,
        lindon: houseProfile('lindon').scale,
      },
    },
    {
      label: 'Hot tub, sauna & water',
      values: {
        river: 'Hot tub + barrel sauna on the Provo River',
        ranch: 'Year-round hot tub under lit pergola + gas fire pit',
        lindon: 'Lindon Aquatics Center lazy river & slides across the street',
      },
    },
    {
      label: 'Game room & entertainment',
      values: {
        river: 'Heated ~850 sq ft game garage + rec room & den',
        ranch: 'Pool table, stand-up arcade, theater seating & bar',
        lindon: 'Stone fireplace living room + private bistro balcony',
      },
    },
    {
      label: 'Kitchens & group dining',
      values: {
        river: 'Two full kitchens (main island + recreation wing)',
        ranch: 'Open island kitchen + chandelier group dining + casita kitchenette',
        lindon: 'Remodeled full kitchen + dining for 6 with Timpanogos view',
      },
    },
    {
      label: 'Remote work & EV charging',
      values: {
        river: 'Dedicated office + fast Wi-Fi + 3 EV chargers',
        ranch: 'Fast Wi-Fi + large multi-car driveway & garage',
        lindon: 'Fast Wi-Fi + quiet residential cul-de-sac parking',
      },
    },
    {
      label: 'Sundance / SLC Airport drive',
      values: {
        river: `~${sundanceMinutes('river')} min to Sundance · ~${slcMinutes('river')} min from SLC`,
        ranch: `~${sundanceMinutes('ranch')} min to Sundance · ~${slcMinutes('ranch')} min from SLC`,
        lindon: `~${sundanceMinutes('lindon')} min to Sundance · ~${slcMinutes('lindon')} min from SLC`,
      },
    },
  ];
}
