import { houseProfile, type HouseRoom } from './house-catalog';
import type { HouseId } from './market/types';
import { RIVER_UNIT_DETAIL } from './river-units';

const KEY_PREFIX = 'uml-stay-rooms:';

function cleanClaim(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
  if (/door\s*code|wi-?fi|password/i.test(trimmed)) return '';
  return trimmed;
}

/**
 * Sleeping rooms a guest can assign across families on `/stay/:token`.
 *
 * Excludes summary rows (`Baths`, `Whole house`), and when a River stay booked only specific wings,
 * scopes strictly to those booked wings so a part-house guest never plans around rooms that are not theirs.
 */
export function stayAssignableRooms(house: HouseId, units?: readonly string[] | null): HouseRoom[] {
  const { rooms } = houseProfile(house);
  const sleeping = rooms.filter((room) => room.name !== 'Baths' && room.name !== 'Whole house');
  if (house !== 'river' || !units || units.length === 0 || units.length >= RIVER_UNIT_DETAIL.length) {
    return sleeping;
  }
  const bookedNames = new Set(
    RIVER_UNIT_DETAIL.filter((unit) => units.includes(unit.id)).map((unit) => unit.name.replace('River ', '')),
  );
  return sleeping.filter((room) => bookedNames.has(room.name));
}

export function loadRoomAssignments(
  token: string,
  storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): Record<string, string> {
  if (!token || !storage) return {};
  try {
    const raw = storage.getItem(`${KEY_PREFIX}${token}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [room, who] of Object.entries(parsed)) {
      const cleaned = cleanClaim(who);
      if (cleaned) out[room.slice(0, 80)] = cleaned;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveRoomAssignments(
  token: string,
  assignments: Record<string, string>,
  storage: Pick<Storage, 'setItem'> | undefined = typeof window === 'undefined' ? undefined : window.localStorage,
): void {
  if (!token || !storage) return;
  try {
    const out: Record<string, string> = {};
    for (const [room, who] of Object.entries(assignments)) {
      const cleaned = cleanClaim(who);
      if (cleaned) out[room.slice(0, 80)] = cleaned;
    }
    storage.setItem(`${KEY_PREFIX}${token}`, JSON.stringify(out));
  } catch {
    // Storage disabled or full; in-memory state still works for the session.
  }
}

export function formatRoomPlanShare(input: {
  houseName: string;
  checkIn: string;
  checkOut: string;
  rooms: readonly HouseRoom[];
  assignments: Record<string, string>;
}): string {
  const header = `${input.houseName} (${input.checkIn} to ${input.checkOut}) — Bedroom plan`;
  const lines = input.rooms.map((room) => {
    const claim = cleanClaim(input.assignments[room.name]);
    return `• ${room.name} (${room.where} · ${room.beds}): ${claim || 'Unassigned'}`;
  });
  return [
    header,
    ...lines,
    'Saved on this phone for group planning — does not change the reservation.',
  ].join('\n');
}
