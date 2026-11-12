import { houseProfile, type HouseRoom } from '../lib/house-catalog';
import type { HouseId } from '../lib/market/types';

/**
 * A house's levels, drawn so a group can see who sleeps where before they book.
 *
 * "Where you'll sleep" answers how many beds; this answers the question a group actually argues about — whether the
 * grandparents are on the same floor as the toddlers, and whether the teenagers are in the basement. A list of rooms
 * cannot answer that quickly, and a photograph certainly cannot.
 *
 * These are diagrams, not architectural plans. They show the levels, the rooms on each, and where the baths are, drawn
 * from the same `houseProfile().rooms` the room cards read, so the two can never disagree. River is the exception: its
 * three wings are a real, separately-bookable layout, so it renders `RiverWingMap` (interactive, with prices) instead.
 */

/** Which rooms sit on which level, in the order the diagram draws them. */
const LEVELS: Record<'ranch' | 'lindon', Array<{ id: string; label: string; note: string; rooms: string[] }>> = {
  ranch: [
    {
      id: 'main',
      label: 'Main level',
      note: 'Kitchen, dining, and the living room with the brick fireplace.',
      rooms: ['Master bedroom'],
    },
    {
      id: 'upper',
      label: 'Upper level',
      note: 'Three bedrooms and a full bath, away from the noise downstairs.',
      rooms: ['Upstairs guest room 1', 'Upstairs guest room 2', 'Upstairs guest room 3'],
    },
    {
      id: 'lower',
      label: 'Lower level',
      note: 'The game level: pool table, theater seating, arcade, and a bar.',
      rooms: ['Basement bedroom 1', 'Basement bedroom 2', 'Basement bedroom 3'],
    },
    {
      id: 'casita',
      label: 'Detached casita',
      note: 'Off the garage, with its own bath and kitchenette.',
      rooms: ['Casita'],
    },
  ],
  lindon: [
    {
      id: 'main',
      label: 'Main level',
      note: 'Living room with the stone fireplace, kitchen, and the front porch.',
      rooms: ['Bedroom 1', 'Bedroom 2', 'Bedroom 3', 'Living room'],
    },
    {
      id: 'lower',
      label: 'Lower level',
      note: 'The quietest room in the house, with its own full bath.',
      rooms: ['Downstairs suite'],
    },
  ],
};

/** The rooms for a level, from the profile, so a renamed room shows up here too. */
function roomsOn(house: HouseId, names: string[]): HouseRoom[] {
  const all = houseProfile(house).rooms;
  return names.flatMap((name) => all.filter((room) => room.name === name));
}

/** The level diagram for a house. River draws its own wing map, so this returns null for it. */
export function HouseFloorLayout({ house }: { house: HouseId }) {
  if (house === 'river') return null;
  const levels = LEVELS[house];
  if (!levels) return null;
  return (
    <div data-bot="house-floor-layout" data-house={house}>
      <ul className="grid gap-3 sm:grid-cols-2">
        {levels.map((level) => {
          const rooms = roomsOn(house, level.rooms);
          return (
            <li key={level.id} className="uml-panel rounded-2xl p-4" data-bot="house-floor-level" data-level={level.id}>
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-display text-xl">{level.label}</p>
                {/*
                  A bed count is deliberately not derived here. "2 twin bunks" starts with a 2 but sleeps four, so summing
                  the leading numbers published a wrong figure — the kind of arithmetic that reads as authoritative
                  because it is a number. Each room states its own beds instead.
                */}
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--uml-muted)]" data-bot="house-floor-count">
                  {rooms.length === 1 ? '1 room' : `${rooms.length} rooms`}
                </p>
              </div>
              <p className="mt-1 text-xs text-[var(--uml-muted)]">{level.note}</p>
              <ul className="mt-2 space-y-1 text-sm">
                {rooms.map((room) => (
                  <li key={room.name} className="flex items-baseline justify-between gap-3" data-bot="house-floor-room">
                    <span>{room.name}</span>
                    <span className="shrink-0 text-xs text-[var(--uml-muted)]">{room.beds}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="house-floor-note">
        Levels are drawn from the published layout, not a measured plan. Ask us if a specific room matters for your group.
      </p>
    </div>
  );
}
