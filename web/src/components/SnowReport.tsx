import { useEffect, useState } from 'react';
import { CloudSnow, ExternalLink, Loader2 } from 'lucide-react';
import { snowByRegion, snowDateLabel, snowHeadline, type ResortSnow } from '../lib/snow-report';
import { loadPublicSnow, snowUpdatedLabel, type PublicSnow } from '../lib/public-snow';

/**
 * Snow, resort by resort, on one page.
 *
 * The question a guest actually asks in winter is "where did it snow, and how much." This answers it in one glance: a row
 * per resort, the last seven days and the next four, with the resort's own report one tap away.
 *
 * Two honesty rules the layout enforces:
 *
 * - The number is **modelled at upper mountain**, and the page says so on the line above the table. It is not a snow
 *   stake, and a guest should not read it as one.
 * - A resort that could not be read is **missing**, not zeroed, and a read that failed says so instead of drawing a dry
 *   mountain.
 */
export function SnowReport({ compact = false }: { compact?: boolean }) {
  const [payload, setPayload] = useState<PublicSnow | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unread'>('loading');

  useEffect(() => {
    let cancelled = false;
    loadPublicSnow()
      .then((result) => {
        if (cancelled) return;
        if (result) {
          setPayload(result);
          setState('ready');
        } else {
          setState('unread');
        }
      })
      .catch(() => {
        if (!cancelled) setState('unread');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'loading') {
    return (
      <div className="uml-panel flex items-center gap-2 rounded-3xl p-5 text-sm text-[var(--uml-muted)]" data-bot="snow-report-loading">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Reading the resort snow.
      </div>
    );
  }

  if (state === 'unread' || !payload) {
    return (
      <div className="uml-panel rounded-3xl p-5" data-bot="snow-report-unread">
        <p className="uml-kicker flex items-center gap-1.5">
          <CloudSnow className="h-3.5 w-3.5" aria-hidden />
          Resort snow
        </p>
        <p className="mt-2 text-sm text-[var(--uml-muted)]">
          The resort snow could not be read just now. That does not mean it did not snow — open a resort&apos;s own report
          below.
        </p>
        <a
          href="https://www.skiutah.com/snowreport/"
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--uml-gold)] underline"
          data-bot="snow-report-skiutah"
        >
          Ski Utah&apos;s official snow report
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    );
  }

  const updated = snowUpdatedLabel(payload.fetchedAt);
  const groups = snowByRegion(payload.rows);
  const missing = Math.max(0, payload.expected - payload.rows.length);

  return (
    <div data-bot="snow-report" data-resorts={payload.rows.length}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="uml-kicker flex items-center gap-1.5">
          <CloudSnow className="h-3.5 w-3.5" aria-hidden />
          Resort snow
        </p>
        <p className="text-[11px] text-[var(--uml-muted)]" data-bot="snow-report-updated">
          {updated ? `Read ${updated} MT · ` : ''}
          {payload.rows.length} of {payload.expected} resorts
        </p>
      </div>

      <p className="mt-2 text-sm leading-relaxed" data-bot="snow-report-headline">
        {snowHeadline(payload.rows, updated ? `${updated} MT` : 'just now')}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--uml-muted)]">
        Modelled snowfall at upper mountain, not a resort snow stake. A resort&apos;s own report is the number to trust for
        base depth and what is open.
        {missing > 0 ? ` ${missing} resort${missing === 1 ? '' : 's'} could not be read and ${missing === 1 ? 'is' : 'are'} left out rather than shown as zero.` : ''}
      </p>

      <div className="mt-4 space-y-5">
        {groups.map((group) => (
          <section key={group.region} data-bot={`snow-region-${group.rows[0]?.key}`}>
            <p className="uml-kicker text-[var(--uml-gold)]">{group.region}</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-[0.1em] text-[var(--uml-muted)]">
                    <th scope="col" className="py-1.5 pr-3 font-medium">Resort</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Last day</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">7 days</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Next 4</th>
                    {compact ? null : <th scope="col" className="py-1.5 font-medium">Days</th>}
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row) => (
                    <ResortRow key={row.key} row={row} compact={compact} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--uml-muted)]">
        <span>{payload.source}</span>
        <a
          href="https://www.skiutah.com/snowreport/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[var(--uml-gold)] underline"
          data-bot="snow-report-skiutah"
        >
          Ski Utah&apos;s official report
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </div>
    </div>
  );
}

function ResortRow({ row, compact }: { row: ResortSnow; compact: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr className="border-t border-white/10 align-middle" data-bot="snow-row" data-resort={row.key}>
        <th scope="row" className="py-2 pr-3 text-left font-medium">
          <a href={row.reportUrl} target="_blank" rel="noreferrer" className="hover:text-[var(--uml-gold)] hover:underline">
            {row.name}
          </a>
          <span className="block text-[10px] font-normal text-[var(--uml-muted)]">
            {row.elevationFt.toLocaleString('en-US')} ft
            {row.fromRiver ? ` · ${row.fromRiver} from the River House` : ''}
          </span>
        </th>
        <td className="py-2 pr-3 tabular-nums" data-bot="snow-last-day">
          {row.lastDay === null ? <span className="text-[var(--uml-muted)]">-</span> : <Inches value={row.lastDay} strong />}
        </td>
        <td className="py-2 pr-3 tabular-nums">
          <Inches value={row.pastTotal} />
        </td>
        <td className="py-2 pr-3 tabular-nums">
          {row.aheadTotal > 0 ? <Inches value={row.aheadTotal} forecast /> : <span className="text-[var(--uml-muted)]">-</span>}
        </td>
        {compact ? null : (
          <td className="py-2">
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-expanded={open}
              data-bot="snow-row-days"
              className="rounded-full border border-[var(--uml-line)] px-2 py-0.5 text-[10px] uppercase tracking-[0.1em] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]"
            >
              {open ? 'Hide' : 'Days'}
            </button>
          </td>
        )}
      </tr>
      {open && !compact ? (
        <tr className="border-t border-white/5" data-bot="snow-row-detail">
          <td colSpan={5} className="pb-3 pt-2">
            <div className="flex flex-wrap gap-1.5">
              {[...row.past, ...row.ahead].map((day) => (
                <span
                  key={day.date}
                  className={`rounded-lg border px-2 py-1 text-[11px] tabular-nums ${
                    day.inches > 0 ? 'border-[var(--uml-gold)]/50 text-[var(--uml-ink)]' : 'border-white/10 text-[var(--uml-muted)]'
                  }`}
                >
                  <span className="block text-[9px] uppercase tracking-[0.08em] text-[var(--uml-muted)]">{snowDateLabel(day.date)}</span>
                  {day.inches === 0 ? '0"' : `${Math.round(day.inches * 10) / 10}"`}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[var(--uml-muted)]">{row.route}</p>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Inches({ value, strong = false, forecast = false }: { value: number; strong?: boolean; forecast?: boolean }) {
  return (
    <span className={strong ? 'font-semibold' : ''}>
      {value === 0 ? <span className="text-[var(--uml-muted)]">0&quot;</span> : `${Math.round(value * 10) / 10}"`}
      {forecast ? <span className="ml-1 text-[9px] uppercase tracking-[0.08em] text-[var(--uml-muted)]">fcst</span> : null}
    </span>
  );
}
