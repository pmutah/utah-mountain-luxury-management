import { useEffect, useState } from 'react';
import type { OwnerPortalView } from '../lib/owner-portal';

type Loaded = OwnerPortalView & { period: 'month' | 'ytd'; month: string; empty: boolean };

function money(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

/**
 * Todd's read-only statement at `/owner/:token`. It names Ranch and River only, has no edit or
 * download control, and does not change a booking or an expense.
 */
export function OwnerPortal({ token }: { token: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [period, setPeriod] = useState<'month' | 'ytd'>('ytd');
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'paused' | 'error'>('loading');

  useEffect(() => {
    let cancel = false;
    void fetch(`/api/owner/${encodeURIComponent(token)}?period=${period}`)
      .then(async (res) => {
        const type = res.headers.get('content-type') ?? '';
        if (!type.includes('application/json')) throw new Error('not json');
        const body = (await res.json()) as Loaded & { storageReads?: string; error?: string };
        return { res, body };
      })
      .then(({ res, body }) => {
        if (cancel) return;
        if (res.status === 404) {
          setState('invalid');
          return;
        }
        if (body.storageReads === 'paused') {
          setState('paused');
          return;
        }
        if (!res.ok) {
          setState('error');
          return;
        }
        setData(body);
        setState('ready');
      })
      .catch(() => {
        if (!cancel) setState('error');
      });
    return () => {
      cancel = true;
    };
  }, [token, period]);

  return (
    <div className="mx-auto max-w-3xl px-5 py-10" data-bot="owner-portal" data-state={state}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8a6f2f]">Utah Mountain Luxury</p>
      <h1 className="mt-2 font-display text-3xl text-[#1d1a15]">Todd’s Ranch and River statement</h1>
      <p className="mt-2 text-sm text-[#5d564b]">
        Read only. This page does not change a booking or a saved expense, and it does not send anything.
      </p>

      {state === 'loading' && (
        <p className="mt-8 text-sm text-[#5d564b]" data-bot="owner-portal-loading">
          Reading the statement…
        </p>
      )}

      {state === 'invalid' && (
        <p className="mt-8 text-sm text-[#5d564b]" data-bot="owner-portal-invalid">
          This owner link is not valid. Ask Brandon for a new one. Nothing was read.
        </p>
      )}

      {state === 'paused' && (
        <p className="mt-8 text-sm text-[#5d564b]" data-bot="owner-portal-paused">
          Saved bookings or expenses could not be read. This page is not using a stand-in statement, and nothing was
          written over them.
        </p>
      )}

      {state === 'error' && (
        <p className="mt-8 text-sm text-[#5d564b]" data-bot="owner-portal-error">
          The statement could not be read just now. It is not empty. Nothing was written.
        </p>
      )}

      {state === 'ready' && data && (
        <>
          <div className="mt-6 flex gap-2">
            {(['ytd', 'month'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setPeriod(id)}
                data-bot={`owner-portal-period-${id}`}
                aria-pressed={period === id}
                className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.16em] ${
                  period === id ? 'border-[#8a6f2f] bg-[#8a6f2f] text-white' : 'border-[#cfc6b6] text-[#5d564b]'
                }`}
              >
                {id === 'ytd' ? 'Year to date' : 'This month'}
              </button>
            ))}
          </div>

          <section className="mt-6 rounded-3xl border border-[#e2dbcd] bg-white p-6" data-bot="owner-portal-total">
            <p className="text-sm text-[#5d564b]">{data.rangeLabel}</p>
            <p className="mt-2 font-display text-4xl text-[#1d1a15]" data-bot="owner-portal-todd">
              {money(data.todd)}
            </p>
            <p className="mt-1 text-sm text-[#5d564b]" data-bot="owner-portal-fee">
              Todd’s share after the management fee. The fee was {money(data.fee)} of {money(data.feeBasis)} of rent after
              cleaning.
            </p>
            {/*
              Only shown when a month had a stay but no cleaning receipt, because the fee basis and the
              costs line both use an assumed figure for it. An estimate presented as a receipt is the
              kind of thing an owner should not have to discover by dividing.
            */}
            {data.houses.some((house) => house.estimatedCleaning > 0) && (
              <p className="mt-2 text-xs text-[#7a7264]" data-bot="owner-portal-estimate">
                {money(data.houses.reduce((total, house) => total + house.estimatedCleaning, 0))} of the cleaning above is
                estimated — a stay was booked but no cleaning receipt was entered for that month. Add the receipt and this
                figure, and the share, update on their own.
              </p>
            )}
          </section>

          {data.empty && (
            <p className="mt-6 text-sm text-[#5d564b]" data-bot="owner-portal-empty">
              There is no Ranch or River statement for this period yet. That is not a zero.
            </p>
          )}

          {!data.empty && (
            <section className="mt-6 rounded-3xl border border-[#e2dbcd] bg-white p-6" data-bot="owner-portal-houses">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8a6f2f]">By house</p>
              <table className="mt-3 w-full text-left text-sm">
                <thead className="text-[#5d564b]">
                  <tr>
                    <th className="py-2 font-normal">House</th>
                    <th className="py-2 font-normal">Stays</th>
                    <th className="py-2 font-normal">Host payout</th>
                    <th className="py-2 font-normal">Costs</th>
                    <th className="py-2 font-normal">Todd</th>
                  </tr>
                </thead>
                <tbody>
                  {data.houses.map((house) => (
                    <tr key={house.id} data-bot="owner-portal-house" data-house={house.id} className="border-t border-[#efe9dd]">
                      <td className="py-2 align-top">
                        {house.name}
                        {/*
                          The working, so the share can be checked by hand. Cleaning sits inside the
                          costs column and is also taken off before the fee; showing both is what makes
                          the row add up instead of looking a few thousand light.
                        */}
                        <span className="mt-1 block text-xs text-[#7a7264]" data-bot="owner-portal-working">
                          {money(house.leftover)} after the {money(house.fee)} fee and costs. Half is {money(house.todd)}.
                        </span>
                      </td>
                      <td className="py-2 align-top">{house.stays}</td>
                      <td className="py-2 align-top">{money(house.revenue)}</td>
                      <td className="py-2 align-top">{money(house.costs)}</td>
                      <td className="py-2 align-top">{money(house.todd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {data.months.length > 0 && (
            <section className="mt-6 rounded-3xl border border-[#e2dbcd] bg-white p-6" data-bot="owner-portal-months">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#8a6f2f]">By month</p>
              <ul className="mt-3 space-y-1 text-sm">
                {data.months.map((row) => (
                  <li key={row.month} data-bot="owner-portal-month" className="flex justify-between border-t border-[#efe9dd] py-2">
                    <span>{row.label}</span>
                    <span>{money(row.todd)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-6 rounded-3xl border border-[#e2dbcd] bg-[#faf7f1] p-6" data-bot="owner-portal-notes">
            <ul className="space-y-2 text-sm text-[#5d564b]">
              {data.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
