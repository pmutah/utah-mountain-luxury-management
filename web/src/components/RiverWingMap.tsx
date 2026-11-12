import { useEffect, useState } from 'react';
import type { PublicUnit } from '../lib/booked-nights';
import { loadQuoteCalendar } from '../lib/booked-nights';
import { quoteWings, RIVER_DRAFT_NIGHTLY, type WingQuoteInput } from '../lib/river-wing-map';
import { RIVER_UNIT_DETAIL, type RiverUnitId } from '../lib/river-units';

const ORDER: RiverUnitId[] = ['main-lodge', 'recreation-wing', 'garage-suite'];

export function RiverWingMap({
  checkIn = '',
  checkOut = '',
  selected: controlledSelected,
  units: providedUnits,
  onChange,
}: {
  checkIn?: string;
  checkOut?: string;
  selected?: RiverUnitId[];
  units?: PublicUnit[] | null;
  onChange?: (units: RiverUnitId[]) => void;
}) {
  const [localSelected, setLocalSelected] = useState<RiverUnitId[]>([]);
  const selected = controlledSelected ?? localSelected;
  const [fetchedWings, setFetchedWings] = useState<WingQuoteInput[] | null>(null);
  useEffect(() => {
    if (providedUnits !== undefined) return;
    let cancel = false;
    loadQuoteCalendar()
      .then((calendar) => {
        if (cancel) return;
        setFetchedWings(toWings(calendar?.units ?? null));
      })
      .catch(() => {
        if (!cancel) setFetchedWings(null);
      });
    return () => {
      cancel = true;
    };
  }, [providedUnits]);
  const wings = providedUnits !== undefined ? toWings(providedUnits) : fetchedWings;
  /*
   * Availability is computed for every part, not only the selected ones.
   *
   * `quoteWings` answers about the parts it is given, and it was being given only the selection — so with nothing
   * selected every card read "Open on these dates", including a part that was sold out. A guest had to pick a wing
   * to find out it was taken. The full list is quoted here so each card tells the truth before anyone clicks, and
   * the selection's own quote still decides the total.
   */
  const inputs = wings ?? ORDER.map((id) => ({ id, nightly: null, cleaning: null, taken: [] }));
  const quote = quoteWings(selected, inputs, checkIn, checkOut);
  const everyPart = quoteWings(ORDER, inputs, checkIn, checkOut);
  const toggle = (id: RiverUnitId) => {
    const next = selected.includes(id) ? selected.filter((unit) => unit !== id) : [...selected, id];
    if (controlledSelected === undefined) setLocalSelected(next);
    onChange?.(next);
  };

  return (
    <section className="uml-panel rounded-3xl p-5" data-bot="river-wing-map">
      <p className="uml-kicker">The wings</p>
      <h2 className="font-display text-3xl mt-1">How the Riverhouse splits</h2>
      <p className="mt-2 max-w-xl text-sm text-[var(--uml-muted)]">
        Main Lodge, Recreation Wing, and Garage Suite. Book one wing, two, or the whole house.
        {wings === null ? ' Live availability could not be read, so nothing here is marked open.' : ''}
      </p>
      <svg viewBox="0 0 640 280" className="mt-4 w-full" role="img" aria-label="Riverhouse wings">
        <WingBox x={24} y={36} w={250} h={200} id="main-lodge" label="Main Lodge" selected={selected.includes('main-lodge')} onClick={toggle} />
        <WingBox x={286} y={36} w={180} h={120} id="recreation-wing" label="Recreation" selected={selected.includes('recreation-wing')} onClick={toggle} />
        <WingBox x={478} y={36} w={138} h={90} id="garage-suite" label="Garage Suite" selected={selected.includes('garage-suite')} onClick={toggle} />
        <text x="320" y="268" textAnchor="middle" fill="var(--uml-muted)" fontSize="12">
          Shared arrival court · private suites stay inside the wing you book
        </text>
      </svg>
      <ul className="mt-2 grid gap-2 sm:grid-cols-3 text-sm">
        {ORDER.map((id) => {
          const detail = RIVER_UNIT_DETAIL.find((unit) => unit.id === id)!;
          const live = wings?.find((wing) => wing.id === id);
          const nightly = live?.nightly ?? null;
          const off = everyPart.unavailable.includes(id);
          return (
            <li key={id}>
              <button
                type="button"
                className="uml-panel w-full rounded-2xl p-3 text-left"
                data-bot={`wing-${id}`}
                data-available={off ? 'no' : 'yes'}
                aria-pressed={selected.includes(id)}
                onClick={() => toggle(id)}
              >
                <p className="font-display text-xl">{detail.name.replace('River ', '')}</p>
                <p className="text-[var(--uml-muted)]">Sleeps {detail.sleeps}</p>
                <p>{nightly ? `$${nightly} / night` : `Draft ask $${RIVER_DRAFT_NIGHTLY[id]} / night`}</p>
                <p>{off ? 'Taken on these dates.' : wings === null ? 'Availability was not read.' : 'Open on these dates.'}</p>
              </button>
            </li>
          );
        })}
      </ul>
      {selected.length > 0 && (
        <p className="mt-3 text-sm" data-bot="wing-quote">
          {quote.whole ? 'Whole Riverhouse' : `${quote.units.length} wing${quote.units.length === 1 ? '' : 's'}`} · sleeps {quote.sleeps}
          {quote.total === null
            ? quote.unavailable.length
              ? ' · not available together on these dates'
              : ' · pick dates to price the stay'
            : ` · $${quote.total.toLocaleString('en-US')} for ${quote.nights} nights${quote.draft ? ' (draft ask where a live rate is missing)' : ''}`}
        </p>
      )}
    </section>
  );
}

/**
 * The API's part list as the wing map's inputs.
 *
 * `PublicUnit.nights` is the nights a part is **free**; `WingQuoteInput.taken` is the nights it is **not**.
 * These were passed straight through, which inverted the answer: a part sold out on the chosen dates read
 * "Open on these dates", and one that was free read "Taken". The complement is taken over the union of the
 * parts' own free lists, so a night outside the calendar window is not mistaken for a booked one.
 *
 * Exported so the mapping itself can be tested; the inversion was invisible to every test of `quoteWings`,
 * because that function was always correct and its caller was not.
 */
export function toWings(units: PublicUnit[] | null): WingQuoteInput[] | null {
  if (!units) return null;
  const window = [...new Set(units.flatMap((row) => row.nights))].sort();
  return ORDER.map((id) => {
    const row = units.find((unit) => unit.id === id);
    const free = new Set(row?.nights ?? []);
    return {
      id,
      nightly: row?.nightly ?? null,
      cleaning: row?.cleaning ?? null,
      taken: window.filter((night) => !free.has(night)),
    };
  });
}

function WingBox({
  x,
  y,
  w,
  h,
  id,
  label,
  selected,
  onClick,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  id: RiverUnitId;
  label: string;
  selected: boolean;
  onClick: (id: RiverUnitId) => void;
}) {
  return (
    <g onClick={() => onClick(id)} style={{ cursor: 'pointer' }} data-bot={`wing-shape-${id}`}>
      <rect x={x} y={y} width={w} height={h} rx={18} fill={selected ? 'var(--uml-gold)' : 'var(--uml-card)'} stroke="var(--uml-line)" />
      <text x={x + 16} y={y + 36} fill={selected ? 'var(--uml-gold-ink)' : 'var(--uml-ink)'} fontSize="16">
        {label}
      </text>
    </g>
  );
}
