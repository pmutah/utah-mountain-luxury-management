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
  const [data, setData] = useState<{
    decision: Decision | null;
    pricedUnits?: string[];
    wholeNightly?: number;
    reason?: string;
    publishes?: boolean;
    writeNote?: string;
  } | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'paused' | 'error'>('loading');

  useEffect(() => {
    let cancel = false;
    void api
      .getRiverSplit(from, until)
      .then((result) => {
        if (cancel) return;
        if (result.storageReads === 'paused') {
          setState('paused');
          return;
        }
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
