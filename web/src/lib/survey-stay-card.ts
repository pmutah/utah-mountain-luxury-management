import type { GuestPreferenceAnswers } from './api';
import { guestArrivalLine } from './arrival';
import { guestDepartureLine } from './departure';

export type StayCardSection = {
  id: string;
  title: string;
  lines: string[];
  tone?: 'ops' | 'alert' | 'note';
};

export type StayCard = {
  title: string;
  subtitle: string;
  sections: StayCardSection[];
};

/** Host ops defaults — not guest survey questions. */
export const RIVER_VIP_ARRIVAL_DEFAULTS = [
  'Kitchen flowers',
  'Mints on beds/nightstands',
  'Scent / clean',
] as const;

function line(...parts: Array<string | undefined | null>): string | null {
  const text = parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join(' · ');
  return text || null;
}

function list(values?: string[]): string | null {
  const clean = (values ?? []).map((v) => v.trim()).filter(Boolean);
  return clean.length ? clean.join(', ') : null;
}

function pushSection(
  sections: StayCardSection[],
  id: string,
  title: string,
  lines: Array<string | null | undefined>,
  tone?: StayCardSection['tone'],
) {
  const clean = lines.map((l) => (l ?? '').trim()).filter(Boolean);
  if (!clean.length) return;
  sections.push({ id, title, lines: clean, tone });
}

function isVipStay(input: {
  propertyId?: string;
  variant?: string;
  answers: GuestPreferenceAnswers;
}): boolean {
  return (
    input.propertyId === 'river' ||
    input.variant === 'vip' ||
    input.answers.surveyVariant === 'vip'
  );
}

function vipArrivalChecklist(a: GuestPreferenceAnswers): string[] {
  const fridge = line(
    a.foodVibe || a.favoriteFood ? `Food vibe: ${a.foodVibe || a.favoriteFood}` : undefined,
    a.snacks || a.favoriteSnack ? `Snacks: ${a.snacks || a.favoriteSnack}` : undefined,
    a.kidsSnack ? `Kids snacks: ${a.kidsSnack}` : undefined,
    a.doNotLeave ? `Do not leave out: ${a.doNotLeave}` : undefined,
  );
  const drinksAlcohol = (a.drinksAlcohol ?? '').toLowerCase();
  const toast =
    drinksAlcohol === 'no' || drinksAlcohol === 'n'
      ? line('Non-drinking toast', a.naDrinkPrefs || a.favoriteNaDrink)
      : drinksAlcohol === 'yes' || drinksAlcohol === 'y'
        ? line('Alcoholic toast', a.alcoholPrefs || a.favoriteAlcohol)
        : line(a.alcoholPrefs || a.favoriteAlcohol, a.naDrinkPrefs || a.favoriteNaDrink);
  const theater = line(
    a.favoriteMovie ? `Movie / genre: ${a.favoriteMovie}` : undefined,
    a.popcornStyle ? `Popcorn: ${a.popcornStyle}` : undefined,
  );
  return [
    ...RIVER_VIP_ARRIVAL_DEFAULTS.map((item) =>
      item === 'Scent / clean' && a.scentNotes
        ? `${item} — ${a.scentNotes}`
        : `${item} — VIP host default`,
    ),
    fridge ? `Fridge stock — ${fridge}` : 'Fridge stock — waiting on guest survey',
    toast ? `Toast beverage — ${toast}` : 'Toast beverage — waiting on guest survey',
    theater ? `Theater / popcorn — ${theater}` : 'Theater / popcorn — waiting on guest survey',
  ];
}

/** Readable arrival-ops card for staff — never a raw key dump. */
export function buildStayCard(input: {
  guestName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  confirmationCode?: string;
  propertyId?: string;
  variant?: string;
  answers: GuestPreferenceAnswers;
}): StayCard {
  const a = input.answers;
  const vip = isVipStay(input);
  const sections: StayCardSection[] = [];

  if (vip) {
    pushSection(sections, 'checklist', 'Pre-arrival checklist', vipArrivalChecklist(a), 'ops');
  }

  const namedArrival = guestArrivalLine(a.arrivalWindow);
  if (namedArrival) pushSection(sections, 'arrival', 'Arrival time', [namedArrival], 'ops');
  const namedDeparture = guestDepartureLine(a.earlyLate);
  if (namedDeparture) pushSection(sections, 'departure', 'Departure time', [namedDeparture], 'ops');

  const occasions = list(a.occasions) ?? a.celebration;
  pushSection(sections, 'occasion', 'Occasion', [
    occasions,
    a.occasionNote || a.celebrationDetail
      ? `Celebrate: ${a.occasionNote || a.celebrationDetail}`
      : null,
  ]);

  pushSection(sections, 'party', 'Who is coming', [
    line(
      a.adults ? `${a.adults} adults` : undefined,
      a.children ? `${a.children} children` : undefined,
    ),
    a.childAges ? `Ages: ${a.childAges}` : null,
    a.partyNames,
    a.leadName && a.leadName !== input.guestName ? `Lead: ${a.leadName}` : null,
    a.cell ? `Cell: ${a.cell}` : null,
  ]);

  pushSection(sections, 'setting', 'Days', [
    a.indoorOutdoor || a.insideOutside,
    a.evenings ? `Evenings: ${a.evenings}` : null,
  ]);

  pushSection(
    sections,
    'activities',
    'Activities',
    [
      list(a.activities) ?? list(a.tripWhy),
      a.fishingGuide === 'yes'
        ? 'Fishing: wants a guide intro'
        : a.fishingGuide === 'no'
          ? 'Fishing: no guide intro'
          : null,
      a.bikeSource === 'house'
        ? 'Bikes: use house bikes'
        : a.bikeSource === 'own'
          ? 'Bikes: bringing their own'
          : a.bikeSource === 'both'
            ? 'Bikes: house bikes and their own'
            : null,
      a.skiResort ? `Skiing resort: ${a.skiResort}` : null,
      a.skiFirstTimer === 'yes'
        ? 'Skiing: first-timer in the group'
        : a.skiFirstTimer === 'no'
          ? 'Skiing: experienced group'
          : null,
    ],
    'ops',
  );

  const amenities = a.amenities ?? a.topAmenities ?? [];
  const lean = amenities.filter((item) =>
    /hot tub|sauna|garage|theater|movie|kitchen|kids|quiet/i.test(item),
  );
  pushSection(
    sections,
    'amenities',
    'Amenities to lean',
    [
      list(lean) ?? list(amenities),
      lean.length && list(amenities) !== list(lean) ? `Also: ${list(amenities)}` : null,
    ],
    'ops',
  );

  if (!vip) {
    pushSection(
      sections,
      'fridge',
      'Fridge / snacks',
      [
        a.foodVibe || a.favoriteFood ? `Food vibe: ${a.foodVibe || a.favoriteFood}` : null,
        a.snacks || a.favoriteSnack ? `Snacks: ${a.snacks || a.favoriteSnack}` : null,
        a.kidsSnack ? `Kids snacks: ${a.kidsSnack}` : null,
        a.doNotLeave ? `Do not leave out: ${a.doNotLeave}` : null,
      ],
      'ops',
    );

    const drinksAlcohol = (a.drinksAlcohol ?? '').toLowerCase();
    const toast =
      drinksAlcohol === 'no' || drinksAlcohol === 'n'
        ? line('Non-drinking toast', a.naDrinkPrefs || a.favoriteNaDrink)
        : drinksAlcohol === 'yes' || drinksAlcohol === 'y'
          ? line('Alcoholic toast', a.alcoholPrefs || a.favoriteAlcohol)
          : line(a.alcoholPrefs || a.favoriteAlcohol, a.naDrinkPrefs || a.favoriteNaDrink);
    pushSection(sections, 'toast', 'Toast beverage', [toast], 'ops');

    pushSection(
      sections,
      'theater',
      'Theater / popcorn',
      [
        a.favoriteMovie ? `Movie / genre: ${a.favoriteMovie}` : null,
        a.popcornStyle ? `Popcorn: ${a.popcornStyle}` : null,
      ],
      'ops',
    );
  }

  pushSection(sections, 'allergies', 'Allergies / dietary', [a.allergies], 'alert');
  pushSection(sections, 'notes', 'Anything else', [a.anythingElse || a.smileItem], 'note');

  const code = input.confirmationCode ? ` · ${input.confirmationCode}` : '';
  return {
    title: `${input.guestName} · ${input.propertyName}`,
    subtitle: `${input.checkIn}–${input.checkOut}${code}`,
    sections,
  };
}
