import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/**
 * What each Riverhouse unit sells for, and whether it can be sold at all.
 *
 * The three units are unpublished Airbnb drafts with no prices, so they start unset. Unset is a real state: a unit
 * with no rate is not sellable and this panel says so, rather than showing a zero or a guess. The house itself sleeps
 * 24 while the three units sum to 25, and that is the host's decision to reconcile, not this panel's to hide.
 */

type Unit = {
  id: string;
  name: string;
  sleeps: number;
  bedrooms: number;
  beds: number;
  baths: number;
  rate: { nightly: number | null; cleaning: number | null; minNights: number | null };
  rateState: 'unset' | 'partial' | 'ready';
  rateLine: string;
  sellable: boolean;
  freeNights: number;
};

type Loaded = {
  units: Unit[] | null;
  wholeHouse: { freeNights: number } | null;
  publishes?: boolean;
  publishNote?: string;
};

/** The house's own published capacity, so the unit total can be compared with it. */
const HOUSE_SLEEPS = 24;

export function RiverUnitsPanel({
  onToast,
}: {
  onToast: (message: string, kind?: 'success' | 'error' | 'info') => void;
}) {
  const [data, setData] = useState<Loaded | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'paused' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  /**
   * What the host is typing, kept apart from what is saved. A blank field means "leave it alone", which is how the
   * merge works, so a blank must not be sent as a zero.
   */
  const [draft, setDraft] = useState<Record<string, { nightly: string; cleaning: string; minNights: string }>>({});

  function load() {
    void api
      .getRiverUnits()
      .then((result) => {
        if (result.storageReads === 'paused' || result.units === null) {
          setState('paused');
          return;
        }
        setData(result);
        setState('ready');
      })
      .catch(() => setState('error'));
  }

  useEffect(() => {
    load();
  }, []);

  function field(unit: Unit, key: 'nightly' | 'cleaning' | 'minNights'): string {
    const typed = draft[unit.id]?.[key];
    if (typed !== undefined) return typed;
    const saved = unit.rate[key];
    return saved === null ? '' : String(saved);
  }

  function edit(unit: Unit, key: 'nightly' | 'cleaning' | 'minNights', value: string) {
    setDraft((current) => ({
      ...current,
      [unit.id]: {
        // Seed all three from what is saved, so editing one field does not blank the other two on screen.
        nightly: current[unit.id]?.nightly ?? (unit.rate.nightly === null ? '' : String(unit.rate.nightly)),
        cleaning: current[unit.id]?.cleaning ?? (unit.rate.cleaning === null ? '' : String(unit.rate.cleaning)),
        minNights: current[unit.id]?.minNights ?? (unit.rate.minNights === null ? '' : String(unit.rate.minNights)),
        [key]: value,
      },
    }));
  }

  async function save(unit: Unit) {
    const typed = draft[unit.id];
    if (!typed) return;
    // Only the fields the host actually typed are sent, so a blank field keeps what is already saved.
    const body: { unit: string; nightly?: number; cleaning?: number; minNights?: number } = { unit: unit.id };
    for (const key of ['nightly', 'cleaning', 'minNights'] as const) {
      const raw = typed[key].trim();
      if (raw === '') continue;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) {
        onToast(`${unit.name}: ${key} has to be a number. Nothing was saved.`, 'error');
        return;
      }
      body[key] = Math.round(parsed);
    }
    if (body.nightly === undefined && body.cleaning === undefined && body.minNights === undefined) {
      onToast(`${unit.name}: nothing was typed, so nothing was saved.`, 'error');
      return;
    }
    setBusy(unit.id);
    try {
      const result = await api.saveRiverUnit(body);
      onToast(`${unit.name}: ${result.rateLine}`);
      setDraft((current) => {
        const next = { ...current };
        delete next[unit.id];
        return next;
      });
      load();
    } catch (err) {
      onToast(err instanceof Error ? err.message : `${unit.name} could not be saved.`, 'error');
    } finally {
      setBusy(null);
    }
  }

  const units = data?.units ?? [];
  const sleepsTotal = units.reduce((sum, unit) => sum + unit.sleeps, 0);
  const sellableCount = units.filter((unit) => unit.sellable).length;

  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="river-units" data-sellable={sellableCount}>
      <p className="uml-kicker">Selling the house in parts</p>
      <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
        The Riverhouse sells whole by default, and these three parts can be sold in the gaps. A night is only ever sold
        once: a whole-house booking blocks all three, and a booking of any part blocks the house and leaves the other
        two open. A unit with no price is <strong>not sellable</strong>, and no guest sees a rate for it.
      </p>

      {state === 'loading' && <p className="mt-4 text-sm">Reading the units…</p>}
      {state === 'paused' && (
        <p className="mt-4 text-sm" data-bot="river-units-paused">
          The unit prices could not be read. They are not empty. Nothing was written.
        </p>
      )}
      {state === 'error' && (
        <p className="mt-4 text-sm" data-bot="river-units-error">
          The units could not be read just now. Nothing was written.
        </p>
      )}

      {state === 'ready' && data && (
        <>
          <p className="mt-3 text-sm" data-bot="river-units-count">
            {sellableCount === 0
              ? 'None of the three parts is sellable yet: each is missing a price.'
              : `${sellableCount} of 3 parts priced and sellable.`}{' '}
            {data.wholeHouse
              ? `The whole house has ${data.wholeHouse.freeNights} free ${data.wholeHouse.freeNights === 1 ? 'night' : 'nights'}.`
              : ''}
          </p>
          {/*
            The parts sum to more than the house. That is a real discrepancy the host has to settle before a
            full-house party can be split, and stating it here is better than letting a guest discover it.
          */}
          {sleepsTotal !== HOUSE_SLEEPS && (
            <p className="mt-2 rounded-xl border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100" data-bot="river-units-capacity">
              The three parts sleep {sleepsTotal} between them, and the whole house sleeps {HOUSE_SLEEPS}. That
              difference needs your decision: either the house figure or one of the parts is wrong.
            </p>
          )}

          <ul className="mt-4 space-y-3">
            {units.map((unit) => (
              <li
                key={unit.id}
                className="rounded-2xl border border-[var(--uml-line)] p-4"
                data-bot="river-unit"
                data-unit={unit.id}
                data-sellable={unit.sellable ? 'yes' : 'no'}
                data-rate-state={unit.rateState}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-display text-xl">{unit.name}</p>
                  <p className="text-xs text-[var(--uml-muted)]">
                    sleeps {unit.sleeps} · {unit.bedrooms}BR · {unit.beds} beds · {unit.baths} baths ·{' '}
                    {unit.freeNights} free {unit.freeNights === 1 ? 'night' : 'nights'}
                  </p>
                </div>
                <p className="mt-1 text-sm" data-bot={`river-unit-line-${unit.id}`}>
                  {unit.rateLine}
                </p>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  {(
                    [
                      ['nightly', 'Nightly', 1],
                      ['cleaning', 'Cleaning', 0],
                      ['minNights', 'Min nights', 1],
                    ] as const
                  ).map(([key, label, min]) => (
                    <label key={key} className="text-xs text-[var(--uml-muted)]">
                      <span className="block">{label}</span>
                      <input
                        type="number"
                        min={min}
                        inputMode="numeric"
                        value={field(unit, key)}
                        onChange={(event) => edit(unit, key, event.target.value)}
                        placeholder={unit.rate[key] === null ? 'not set' : ''}
                        data-bot={`river-unit-${key}-${unit.id}`}
                        className="mt-1 w-24 rounded-xl border border-[var(--uml-line)] bg-transparent px-2 py-2 text-sm text-[var(--uml-ink)]"
                      />
                    </label>
                  ))}
                  <button
                    type="button"
                    disabled={busy === unit.id}
                    onClick={() => void save(unit)}
                    data-bot={`river-unit-save-${unit.id}`}
                    className="min-h-11 rounded-full border border-[var(--uml-line)] px-4 py-2 text-xs uppercase tracking-[0.12em] disabled:opacity-50"
                  >
                    {busy === unit.id ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </li>
            ))}
          </ul>

      {/*
        The honest boundary. A rate set here reaches our own booking page; it does not reach Airbnb, Vrbo, or
        Hospitable, and a booking taken on those channels is not reflected in the free-night counts above.
      */}
      {/*
        Selling the house in parts has a consequence the pricing panel is the right place to state: there is one door
        code for the building, so a guest in one part can open every part. Two guests who do not know each other would
        both hold a working code for the whole house. That is the host's decision to make or fix, not something to leave
        unsaid while they set a price that invites it.
      */}
      <p className="mt-4 rounded-xl border border-amber-700/50 bg-amber-950/40 px-3 py-2 text-xs text-amber-100" data-bot="river-units-door">
        One door code covers the whole building, so a guest booked into one part can open every part. Selling a part
        while another guest is in the house means two strangers hold the same code. Give each part its own lock, or keep
        the house whole, before you sell parts on the same nights.
      </p>
      <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="river-units-publish">
        {data.publishNote ??
          'Blocks and prices stay in this app. Nothing is sent to Hospitable, Airbnb, or Vrbo from here.'}
      </p>
        </>
      )}
    </section>
  );
}
