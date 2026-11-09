import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { RIVER_UNIT_DETAIL } from '../lib/river-units';
import { addDays } from '../lib/market/dates';

/**
 * Whole or split, for the next two weeks, with the numbers behind the answer.
 *
 * The decision engine existed and was tested, and no surface ever showed it — so a host could not see the one thing the
 * spec asks for: an explanation of why a range is held whole or offered in parts. This card is that surface.
 *
 * It decides nothing itself. It shows what the route answered, including the case where the answer is "no part has a
 * price yet, so there is nothing to split".
 */

type Decision = {
  choice: 'whole' | 'split' | 'both';
  reason: string;
  wholeExpected: number;
  splitExpected: number;
  units: string[];
  heldWholeForPeak?: boolean;
};

const CHOICE_LABEL: Record<Decision['choice'], string> = {
  whole: 'Hold the whole house',
  split: 'Offer parts',
  both: 'Keep the house open and offer the parts',
};

const SHORT = new Map<string, string>(RIVER_UNIT_DETAIL.map((unit) => [unit.id as string, unit.name.replace('River ', '')]));

export function RiverSplitPanel({ from }: { from: string }) {
  const until = addDays(from, 14);
  /*
   * The host's split mode. It lives on the server now, not in this component.
   *
   * It used to be `useState` only, so every reload put the house back to `auto` — a host who had turned splitting off
   * found it on again the next morning. The panel adopts whatever the route reports, and a change is written back.
   */
  const [mode, setMode] = useState<'auto' | 'suggest-only' | 'off'>('auto');
  const [modeNote, setModeNote] = useState<string | null>(null);
  const [data, setData] = useState<{
    decision: Decision | null;
    pricedUnits?: string[];
    wholeNightly?: number;
    reason?: string;
    publishes?: boolean;
    writeNote?: string;
    engineChoice?: string;
    overridden?: boolean;
    modeLine?: string | null;
  } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'paused' | 'error'>('loading');

  useEffect(() => {
    let cancel = false;
    setState('loading');
    // No mode in the query: the route answers with the saved setting, so a reload keeps it.
    void api
      .getRiverSplit(from, until)
      .then((result) => {
        if (cancel) return;
        if (result.storageReads === 'paused') {
          setState('paused');
          return;
        }
        if (result.mode === 'auto' || result.mode === 'suggest-only' || result.mode === 'off') setMode(result.mode);
        setData(result);
        setState('ready');
      })
      .catch(() => {
        if (!cancel) setState('error');
      });
    return () => {
      cancel = true;
    };
  }, [from, until]);

  /**
   * Change the setting and save it.
   *
   * The card re-reads afterwards so what it shows is the saved answer, not the one this browser hoped for. A failed save
   * says so rather than leaving the button pressed and the server unchanged.
   */
  async function chooseMode(next: 'auto' | 'suggest-only' | 'off') {
    setModeNote(null);
    const previous = mode;
    setMode(next);
    try {
      const saved = await api.saveRiverSplitMode(next);
      setModeNote(saved.note);
      const refreshed = await api.getRiverSplit(from, until);
      if (refreshed.storageReads !== 'paused') setData(refreshed);
    } catch (err) {
      // The save did not land, so the control must not keep claiming the new setting.
      setMode(previous);
      setModeNote(err instanceof Error ? err.message : 'That setting could not be saved.');
    }
  }

  const decision = data?.decision ?? null;

  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="river-split" data-choice={decision?.choice ?? 'none'}>
      <p className="uml-kicker">Whole or split · {from} to {until}</p>
      {/*
        The rule a host needs before reading any number: holding the house whole is the default, and splitting is for the
        gaps. A card that opened with a revenue comparison would read as "always split for more".
      */}
      <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
        The house is held whole whenever it can plausibly sell whole, and offered in parts only to fill nights it will not
        take. Every answer below names the money it compared.
      </p>

      {/*
        The mode changes the answer, so it lives on the page. Auto acts on the decision, suggest-only is advice, and off
        never offers the parts — each one alters what is reported below.
      */}
      <div className="mt-4 flex flex-wrap gap-2" data-bot="river-split-modes" role="group" aria-label="Split mode">
        {(
          [
            ['auto', 'Auto'],
            ['suggest-only', 'Suggest only'],
            ['off', 'Off'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            data-bot={`river-split-mode-${value}`}
            aria-pressed={mode === value}
            onClick={() => void chooseMode(value)}
            className={`min-h-11 rounded-full border px-3 py-2 text-xs uppercase tracking-[0.12em] ${
              mode === value ? 'border-[var(--uml-gold)] text-[var(--uml-gold)]' : 'border-[var(--uml-line)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {modeNote && (
        <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="river-split-mode-note">
          {modeNote}
        </p>
      )}

      {state === 'loading' && <p className="mt-4 text-sm">Working out the next two weeks…</p>}
      {state === 'paused' && (
        <p className="mt-4 text-sm" data-bot="river-split-paused">
          The split decision could not be read. It is not an empty answer, and nothing was written.
        </p>
      )}
      {state === 'error' && (
        <p className="mt-4 text-sm" data-bot="river-split-error">
          The split decision could not be read just now. Nothing was written.
        </p>
      )}

      {state === 'ready' && !decision && (
        <p className="mt-4 text-sm" data-bot="river-split-unpriced">
          {data?.reason ??
            'No part of the Riverhouse has a price, so there is nothing to split. Set a nightly rate on a part first.'}
        </p>
      )}

      {state === 'ready' && decision && (
        <>
          <p className="mt-3 font-display text-2xl" data-bot="river-split-choice">
            {CHOICE_LABEL[decision.choice]}
          </p>
          <p className="mt-1 text-sm" data-bot="river-split-reason">
            {decision.reason}
          </p>
          {/*
            An override must be visible, not silent. When the mode changed the engine's choice the card says so and names
            what the engine wanted, so a host can see what turning splitting off is costing them.
          */}
          {data?.overridden && (
            <p className="mt-2 text-sm text-amber-300/90" data-bot="river-split-overridden" data-engine={data.engineChoice}>
              Overridden: the engine chose {data.engineChoice}. {data.modeLine}
            </p>
          )}
          {!data?.overridden && data?.modeLine && (
            <p className="mt-2 text-sm text-[var(--uml-muted)]" data-bot="river-split-modeline">
              {data.modeLine}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--uml-muted)]">
            <span data-bot="river-split-whole">Whole house expected ${decision.wholeExpected}</span>
            <span data-bot="river-split-parts">Parts expected ${decision.splitExpected}</span>
            {data?.wholeNightly ? <span>Card ${data.wholeNightly} a night</span> : null}
          </div>
          {decision.units.length > 0 && (
            <p className="mt-2 text-sm" data-bot="river-split-units">
              Offered in parts: {decision.units.map((unit) => SHORT.get(unit) ?? unit).join(', ')}.
            </p>
          )}
          {/*
            The honest boundary. A decision is advice; nothing here blocks a night or reaches another channel.
          */}
          <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="river-split-write">
            {data?.writeNote ??
              'This decides what to offer. It does not block a night, publish a rate, or send anything to Airbnb or Vrbo.'}
          </p>
        </>
      )}
    </section>
  );
}
