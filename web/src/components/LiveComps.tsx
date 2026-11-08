import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatWhole } from '../lib/luxury';
import { eachNight, isRealDay } from '../lib/market/dates';
import { MAX_ASK_NIGHTS, liveCardRows, mergedCompCount } from '../lib/market/live';
import type { HouseId } from '../lib/market/types';

type LiveCard = ReturnType<typeof liveCardRows>[number];

/**
 * The saved comps for one house. They are real listings the host entered, not samples.
 * Saving one writes the comp set; it never writes a rate, a booking, or an expense.
 */
export function LiveComps({ house, from, days = 90 }: { house: HouseId; from: string; days?: number }) {
  const [cards, setCards] = useState<LiveCard[] | null>(null);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ url: '', label: '', sleeps: '', distanceMi: '', area: '' });
  /**
   * The channel the comp asks on. Airbnb and VRBO leave the host a different share (84.5% vs 92%),
   * and this value is what converts an observed guest ask to host net. It used to be hardcoded to
   * airbnb, so every VRBO comp was read as if Airbnb had taken 15.5% of it.
   */
  const [platform, setPlatform] = useState<'airbnb' | 'vrbo'>('airbnb');
  const [saved, setSaved] = useState<string | null>(null);
  const [askNotice, setAskNotice] = useState<string | null>(null);
  /** One night and one guest ask per comp, so a host can record what a listing actually shows. */
  const [askForm, setAskForm] = useState<Record<string, { date?: string; rate?: string }>>({});
  const [askBusy, setAskBusy] = useState<string | null>(null);
  const [nights, setNights] = useState<Record<string, number>>({});
  const [needsHouse, setNeedsHouse] = useState(0);

  /** The nights one save covers. A listing shows one rate for a run, so a run is what gets recorded. */
  function askNights(compId: string): number {
    const chosen = nights[compId];
    if (!Number.isInteger(chosen) || chosen < 1) return 1;
    return Math.min(chosen, MAX_ASK_NIGHTS);
  }

  /** Record the ask a comp lists. A missing night or rate is refused before the route is asked. */
  async function saveAsk(compId: string) {
    const entry = askForm[compId] ?? {};
    const date = entry.date ?? '';
    const rate = Number(entry.rate);
    if (!isRealDay(date)) {
      setError('Choose the first night this ask is for.');
      return;
    }
    if (!Number.isFinite(rate) || rate <= 0) {
      setError('Enter the guest ask above zero.');
      return;
    }
    const count = askNights(compId);
    const first = eachNight(date, count);
    const last = first[first.length - 1]!;
    if (!isRealDay(last)) {
      setError('That run of nights does not fit on the calendar.');
      return;
    }
    setAskBusy(compId);
    setError(null);
    try {
      const nightRate = Math.round(rate);
      await api.saveCompAsks({
        compId,
        asks: first.map((night) => ({ date: night, nightlyRate: nightRate })),
      });
      setAskNotice(
        count === 1
          ? `Recorded $${nightRate} for ${date}. That night now uses the saved ask.`
          : `Recorded $${nightRate} for ${count} nights from ${date} to ${last}. Those nights now use the saved ask.`,
      );
      setAskForm((current) => ({ ...current, [compId]: {} }));
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The ask could not be saved.');
    } finally {
      setAskBusy(null);
    }
  }

  const load = useCallback(() => {
    void api
      .getCompSnapshots(house)
      .then((result) => {
        if (result.storageReads === 'paused' || !result.liveComps || !result.snaps) {
          setPaused(true);
          setCards(null);
          return;
        }
        setPaused(false);
        setError(null);
        setNeedsHouse(result.needsHouse ?? 0);
        setCards(liveCardRows(result.liveComps, result.snaps, eachNight(from, days), house));
      })
      .catch(() => {
        setCards(null);
        setError('The saved comps could not be read. This list is not empty.');
      });
  }, [house, from, days]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    const sleeps = Number(form.sleeps);
    const distanceMi = Number(form.distanceMi);
    if (!form.url.trim() || !form.label.trim()) {
      setError('A listing URL and a label are required.');
      return;
    }
    if (!Number.isInteger(sleeps) || sleeps < 1 || !Number.isFinite(distanceMi) || distanceMi < 0) {
      setError('A sleep count and a distance are required. The rate band cannot use a comp without them.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await api.saveComp({
        platform,
        url: form.url.trim(),
        label: form.label.trim(),
        /*
         * The house this tab is showing. Without it the comp counted for every house, and the save
         * route now refuses a comp that does not name one.
         */
        propertyId: house,
        sleeps,
        distanceMi,
        ...(form.area.trim() ? { area: form.area.trim() } : {}),
      });
      setSaved(created.label);
      setForm({ url: '', label: '', sleeps: '', distanceMi: '', area: '' });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The comp could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const input = 'w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-3 py-2 text-sm';

  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="market-live-comps">
      <p className="uml-kicker">Saved comps</p>
      <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
        Real listings you entered, not samples. A saved comp sets the rate band only when it names how many it sleeps and
        how far it sits, and only for a night that carries a saved ask. Saving one does not post a rate.
      </p>

      {paused && (
        <p className="mt-4 text-sm" data-bot="market-live-paused">
          The saved comps could not be read. This is not an empty list, and nothing was written over them.
        </p>
      )}
      {error && !paused && (
        <p className="mt-4 text-sm" data-bot="market-live-error">
          {error}
        </p>
      )}
      {saved && (
        <p className="mt-4 text-sm" data-bot="market-live-saved">
          Saved {saved}. It sets the band on a night that carries an ask.
        </p>
      )}
      {askNotice && (
        <p className="mt-4 text-sm" data-bot="market-live-ask-saved">
          {askNotice}
        </p>
      )}

      {!paused && cards && (
        <>
          <p className="mt-3 text-xs text-[var(--uml-muted)]" data-bot="market-live-count">
            {/*
              This panel lists every saved comp, and the band table above lists only the ones that can set a
              band. Both numbers are correct, and together they read as a contradiction — River showed
              "6 saved comps" here and "5 of 5 saved comps" above, with nothing saying why. The second
              sentence names the split so the two panels reconcile on the page.
            */}
            {mergedCompCount(0, cards.length)}
            {cards.length > 0 &&
              (() => {
                const banding = cards.filter((row) => row.setsBand).length;
                if (banding === cards.length) return ' Every one of them can set the rate band.';
                return ` ${banding} of ${cards.length} can set the rate band; the rest are listed here and left out, and each says why.`;
              })()}
          </p>
          {needsHouse > 0 && (
            <p className="mt-2 text-sm" data-bot="market-live-needs-house">
              {needsHouse === 1 ? '1 saved comp has' : `${needsHouse} saved comps have`} no house, so{' '}
              {needsHouse === 1 ? 'it sets' : 'they set'} no rate band. A comp is only compared with the house it
              was entered for. Save {needsHouse === 1 ? 'it' : 'them'} again on the right house tab to use{' '}
              {needsHouse === 1 ? 'it' : 'them'}.
            </p>
          )}
          {cards.length === 0 ? (
            <p className="mt-2 text-sm" data-bot="market-live-empty">
              No saved comp yet. The band is the sample set.
            </p>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {cards.map((row) => (
                <li
                  key={row.comp.id}
                  data-bot="market-live-comp"
                  data-house={house}
                  className="rounded-2xl border border-[var(--uml-line)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="uml-kicker">
                        {row.comp.area} · {row.comp.distanceMi} mi
                      </p>
                      <h3 className="mt-1 font-display text-xl leading-tight">{row.comp.name}</h3>
                    </div>
                    {row.ask !== null ? (
                      /*
                       * `formatWhole`, because this printed a bare `2400` beside a page where every other
                       * price is `$2,400`. An unformatted number on a card of guest asks reads as a count,
                       * and this is the one figure the host records by hand.
                       */
                      <p className="uml-num text-base" data-bot="market-live-ask">
                        {formatWhole(row.ask)}
                      </p>
                    ) : (
                      <p className="max-w-32 text-right text-xs text-[var(--uml-muted)]" data-bot="market-live-ask">
                        No saved ask
                      </p>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-[var(--uml-muted)]">
                    sleeps {row.comp.sleeps}
                    {row.comp.beds ? ` · ${row.comp.beds} bed` : ''}
                    {row.comp.rating ? ` · ${row.comp.rating.toFixed(2)}` : ''}
                    {row.comp.reviews ? ` · ${row.comp.reviews} reviews` : ''}
                  </p>
                  <p className="mt-1 text-xs text-[var(--uml-muted)]" data-bot="market-live-fit">
                    {row.line}
                  </p>
                  <div className="mt-2 flex flex-wrap items-end gap-2" data-bot="market-live-ask-form">
                    <label className="text-xs text-[var(--uml-muted)]">
                      Night
                      <input
                        type="date"
                        value={askForm[row.comp.id]?.date ?? ''}
                        onChange={(event) =>
                          setAskForm({ ...askForm, [row.comp.id]: { ...askForm[row.comp.id], date: event.target.value } })
                        }
                        data-bot="market-live-ask-date"
                        className="ml-1 rounded-full border border-[var(--uml-line)] bg-transparent px-2 py-1"
                      />
                    </label>
                    <label className="text-xs text-[var(--uml-muted)]">
                      Guest ask
                      <input
                        type="number"
                        min={1}
                        value={askForm[row.comp.id]?.rate ?? ''}
                        onChange={(event) =>
                          setAskForm({ ...askForm, [row.comp.id]: { ...askForm[row.comp.id], rate: event.target.value } })
                        }
                        data-bot="market-live-ask-rate"
                        className="ml-1 w-24 rounded-full border border-[var(--uml-line)] bg-transparent px-2 py-1"
                      />
                    </label>
                    <label className="text-xs text-[var(--uml-muted)]">
                      Nights
                      <input
                        type="number"
                        min={1}
                        max={MAX_ASK_NIGHTS}
                        value={askNights(row.comp.id)}
                        onChange={(event) =>
                          setNights({ ...nights, [row.comp.id]: Number(event.target.value) })
                        }
                        data-bot="market-live-ask-nights"
                        className="ml-1 w-16 rounded-full border border-[var(--uml-line)] bg-transparent px-2 py-1"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={askBusy === row.comp.id}
                      onClick={() => void saveAsk(row.comp.id)}
                      data-bot="market-live-ask-save"
                      className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-xs uppercase tracking-[0.16em] disabled:opacity-50"
                    >
                      {askBusy === row.comp.id ? 'Saving…' : 'Save ask'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <form
        className="mt-5 grid gap-2 sm:grid-cols-2"
        data-bot="market-live-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <input
          className={input}
          data-bot="market-live-url"
          placeholder="Listing URL"
          value={form.url}
          onChange={(event) => setForm({ ...form, url: event.target.value })}
        />
        <input
          className={input}
          data-bot="market-live-label"
          placeholder="Label"
          value={form.label}
          onChange={(event) => setForm({ ...form, label: event.target.value })}
        />
        <input
          className={input}
          data-bot="market-live-sleeps"
          inputMode="numeric"
          placeholder="Sleeps"
          value={form.sleeps}
          onChange={(event) => setForm({ ...form, sleeps: event.target.value })}
        />
        <input
          className={input}
          data-bot="market-live-distance"
          inputMode="decimal"
          placeholder="Miles away"
          value={form.distanceMi}
          onChange={(event) => setForm({ ...form, distanceMi: event.target.value })}
        />
        <input
          className={input}
          data-bot="market-live-area"
          placeholder="Area (optional)"
          value={form.area}
          onChange={(event) => setForm({ ...form, area: event.target.value })}
        />
        <label className="text-xs uppercase tracking-[0.16em] text-[var(--uml-muted)]">
          Channel
          <select
            data-bot="market-live-platform"
            value={platform}
            onChange={(event) => setPlatform(event.target.value === 'vrbo' ? 'vrbo' : 'airbnb')}
            className={`${input} mt-1`}
          >
            <option value="airbnb">Airbnb</option>
            <option value="vrbo">VRBO</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || paused}
          data-bot="market-live-save"
          className="uml-gold-btn rounded-full px-4 py-2 text-xs uppercase tracking-[0.16em] disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Save comp'}
        </button>
      </form>
      <p className="mt-2 text-xs text-[var(--uml-muted)]">
        A sleep count and a distance are required. Nothing is posted to Airbnb, VRBO, or Hospitable.
      </p>
    </section>
  );
}
