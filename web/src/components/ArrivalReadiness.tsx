import { useEffect, useState } from 'react';
import { api, type Reservation } from '../lib/api';
import { arrivalBoard, type ArrivalRow } from '../lib/arrival-readiness';
import { currentDayIso } from '../lib/months';
import { useViewer } from '../lib/platform/viewer';

export function ArrivalReadiness({ reservations }: { reservations: Reservation[] }) {
  const viewer = useViewer();
  const hideLindon = viewer.known && viewer.houses !== null && !viewer.houses.includes('lindon');
  const [rows, setRows] = useState<ArrivalRow[]>([]);
  useEffect(() => {
    let cancel = false;
    Promise.all([api.getGuestGuides().catch(() => null), api.getCleanProgress().catch(() => null), api.getCleanPhotoTurns().catch(() => null)]).then(
      ([guides, progress, photos]) => {
        if (cancel) return;
        const codes = guides
          ? Object.fromEntries(
              (['ranch', 'lindon', 'river'] as const).map((house) => [
                house,
                { doorCode: guides.guides[house]?.doorCode, partDoorCodes: guides.guides[house]?.partDoorCodes },
              ]),
            )
          : null;
        const counts: Record<string, number> = {};
        if (photos?.counts) {
          for (const [key, value] of Object.entries(photos.counts)) {
            const parsed = Number(String(value).match(/\d+/)?.[0] ?? '');
            if (Number.isFinite(parsed)) counts[key] = parsed;
          }
        }
        setRows(
          arrivalBoard({
            reservations,
            asOf: currentDayIso(),
            guides: codes,
            progress: progress?.progress ?? null,
            photoCounts: photos ? counts : null,
            hideLindon,
          }),
        );
      },
    );
    return () => {
      cancel = true;
    };
  }, [reservations, hideLindon]);

  return (
    <section className="uml-panel rounded-3xl p-5" data-bot="arrival-readiness">
      <p className="uml-kicker">Next 72 hours</p>
      <h2 className="font-display text-3xl mt-1">Arrival readiness</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--uml-muted)]">No check-in in the next three days.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {rows.map((row) => (
            <li key={row.id} data-bot="arrival-row">
              <p className="text-sm">
                <span className="font-display text-2xl">{row.guest}</span>
                <span className="text-[var(--uml-muted)]"> · {row.house} · {row.checkIn}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {row.pills.map((pill) => (
                  <span
                    key={pill.id}
                    title={pill.detail}
                    data-state={pill.state}
                    className="rounded-full border border-[var(--uml-line)] px-3 py-1 text-[11px] uppercase tracking-wider"
                    style={{
                      color: pill.state === 'ready' ? 'var(--uml-success)' : pill.state === 'missing' ? 'var(--uml-danger)' : 'var(--uml-muted)',
                    }}
                  >
                    {pill.label}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
