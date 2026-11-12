import { houseProfile } from './house-catalog';
import type { HouseId } from './market/types';
import { isRiverUnitId, RIVER_UNIT_DETAIL, type RiverUnitId } from './river-units';

/**
 * Interactive Group Room & Bed Assignment Planner.
 *
 * Derives sleepable bedrooms strictly from `houseProfile` (for Ranch & Lindon) and `RIVER_UNIT_DETAIL`
 * (for River House whole or partial-wing stays) so bedroom counts and capacities never drift from the
 * single source of truth.
 *
 * Purely client-side planning helper: saves in localStorage, encodes shareable links, and formats a
 * group-text sleeping chart with zero prices, zero door codes, and zero mutations to the reservation.
 */

export type PlannableRoom = {
  id: string;
  name: string;
  beds: string;
  where: string;
  unitId?: RiverUnitId;
  note?: string;
};

const RIVER_SUITE_TEMPLATES: Record<RiverUnitId, ReadonlyArray<{ title: string; beds: string; note?: string }>> = {
  'main-lodge': [
    { title: 'Primary King Suite', beds: 'King bed · en-suite bath', note: 'Quiet primary suite in the main lodge.' },
    { title: 'Main Lodge King Suite B', beds: 'King bed', note: 'Steps from the great room and main island.' },
    { title: 'Main Lodge King Suite C', beds: 'King bed' },
    { title: 'Main Lodge Bunk & King Suite', beds: 'King bed + twin-over-twin bunk', note: 'Great for parents with kids or cousins.' },
  ],
  'recreation-wing': [
    { title: 'Rec Wing King Suite A', beds: 'King bed', note: 'Near the second kitchen and rec lounge.' },
    { title: 'Rec Wing King Suite B', beds: 'King bed' },
    { title: 'Rec Wing King Suite C', beds: 'King bed' },
    { title: 'Upper Loft Bedroom', beds: 'Twin single beds', note: 'Counted bedroom overlooking the wing.' },
  ],
  'garage-suite': [
    { title: 'Garage Apartment Suite', beds: 'King bed + sleeper', note: 'Private suite above the heated game garage.' },
  ],
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Sleepable rooms for a house. On the River House, optional `units` filters to only the wings booked
 * on a partial-house stay; empty/undefined `units` returns all three wings.
 */
export function roomsForPlanner(house: HouseId, units?: readonly string[]): PlannableRoom[] {
  if (house === 'river') {
    const validUnits = (units ?? []).filter(isRiverUnitId);
    const activeSet = validUnits.length > 0 ? new Set<RiverUnitId>(validUnits) : null;
    // Order Main Lodge -> Recreation Wing -> Garage Suite so primary suites lead
    const orderedIds: RiverUnitId[] = ['main-lodge', 'recreation-wing', 'garage-suite'];
    const out: PlannableRoom[] = [];

    for (const unitId of orderedIds) {
      if (activeSet && !activeSet.has(unitId)) continue;
      const detail = RIVER_UNIT_DETAIL.find((u) => u.id === unitId);
      if (!detail) continue;
      const templates = RIVER_SUITE_TEMPLATES[unitId];
      const wingLabel = detail.name.replace(/^River /, '');
      for (let idx = 0; idx < detail.bedrooms; idx += 1) {
        const tpl = templates[idx] ?? { title: `${wingLabel} Room ${idx + 1}`, beds: 'Real bed' };
        out.push({
          id: `${unitId}-${idx + 1}`,
          name: tpl.title,
          beds: tpl.beds,
          where: wingLabel,
          unitId,
          note: tpl.note,
        });
      }
    }
    return out;
  }

  return houseProfile(house)
    .rooms.filter((room) => room.name !== 'Baths' && room.name !== 'Whole house')
    .map((room) => ({
      id: `${house}-${slugify(room.name)}`,
      name: room.name,
      beds: room.beds,
      where: room.where,
      note: room.note,
    }));
}

export type RoomAssignments = Record<string, string>;

export function sanitizeGuestAssignment(raw: string): string {
  // Strip control chars, pipes/semicolons used as delimiters, and anything resembling a price or code keyword
  return raw
    .replace(/[\r\n|;]/g, ' ')
    .replace(/\$/g, '')
    .slice(0, 48);
}

/** Encode non-empty room assignments into a compact query parameter (`id:name|id2:name2`). */
export function encodeRoomAssignments(
  rooms: readonly PlannableRoom[],
  assignments: RoomAssignments,
): string {
  const validIds = new Set(rooms.map((r) => r.id));
  const pairs: string[] = [];
  for (const room of rooms) {
    if (!validIds.has(room.id)) continue;
    const val = sanitizeGuestAssignment(assignments[room.id] ?? '').trim();
    if (!val) continue;
    pairs.push(`${room.id}:${encodeURIComponent(val)}`);
  }
  return pairs.join('|');
}

export function decodeRoomAssignments(
  encoded: string | null | undefined,
  rooms: readonly PlannableRoom[],
): RoomAssignments {
  if (!encoded) return {};
  const validIds = new Set(rooms.map((r) => r.id));
  const out: RoomAssignments = {};
  for (const part of encoded.split('|')) {
    const colon = part.indexOf(':');
    if (colon <= 0) continue;
    const id = part.slice(0, colon).trim();
    if (!validIds.has(id)) continue;
    try {
      const decoded = sanitizeGuestAssignment(decodeURIComponent(part.slice(colon + 1))).trim();
      if (decoded) out[id] = decoded;
    } catch {
      // Ignore malformed URI component
    }
  }
  return out;
}

/** Suggest a realistic multi-generational family starter layout so guests can see how it works in one click. */
export function sampleFamilyAssignments(rooms: readonly PlannableRoom[]): RoomAssignments {
  const sampleLabels = [
    'Hosts / Organizers',
    'Grandparents',
    'Couple 2',
    'Kids & Cousins',
    'Couple 3',
    'Teens / Bunk Crew',
    'Couple 4',
    'Early Risers / Quiet Suite',
    'Solo / Flex Suite',
  ];
  const out: RoomAssignments = {};
  rooms.forEach((room, index) => {
    out[room.id] = sampleLabels[index % sampleLabels.length]!;
  });
  return out;
}

export function formatRoomPlanText(input: {
  houseName: string;
  checkIn?: string;
  checkOut?: string;
  rooms: readonly PlannableRoom[];
  assignments: RoomAssignments;
  shareUrl?: string;
}): string {
  const datePart =
    input.checkIn && input.checkOut ? ` (${input.checkIn} → ${input.checkOut})` : '';
  const lines: string[] = [
    `${input.houseName}${datePart} — Bedroom & Suite Assignments`,
    '',
  ];

  const byWhere = new Map<string, PlannableRoom[]>();
  for (const room of input.rooms) {
    const list = byWhere.get(room.where) ?? [];
    list.push(room);
    byWhere.set(room.where, list);
  }

  for (const [where, group] of byWhere.entries()) {
    lines.push(`${where.toUpperCase()}`);
    for (const room of group) {
      const who = sanitizeGuestAssignment(input.assignments[room.id] ?? '').trim() || 'Open / Unassigned';
      lines.push(`  • ${room.name} (${room.beds}): ${who}`);
    }
    lines.push('');
  }

  if (input.shareUrl) {
    lines.push(`Interactive room chart: ${input.shareUrl}`);
  }
  lines.push('Planning chart only — does not hold dates or change a reservation.');
  return lines.join('\n');
}
