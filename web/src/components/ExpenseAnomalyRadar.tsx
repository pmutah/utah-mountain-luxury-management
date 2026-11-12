import type { Expense, Reservation } from '../lib/api';
import { utilitySpikes } from '../lib/utility-anomalies';
import { useViewer } from '../lib/platform/viewer';

export function ExpenseAnomalyRadar({
  expenses,
  reservations,
  house,
}: {
  expenses: Expense[];
  reservations: Reservation[];
  house?: string;
}) {
  const viewer = useViewer();
  const houses = house ? [house] : viewer.known && viewer.houses ? viewer.houses : ['ranch', 'lindon', 'river'];
  const spikes = utilitySpikes({ expenses, reservations, houses });
  return (
    <section className="uml-panel rounded-3xl p-5" data-bot="expense-radar">
      <p className="uml-kicker">Utilities</p>
      <h2 className="font-display text-3xl mt-1">Spike radar</h2>
      {spikes.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--uml-muted)]">No utility bill is 1.6× its usual month, and none stands out in a nearly empty month.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {spikes.slice(0, 8).map((spike) => (
            <li key={spike.id} data-bot="expense-spike">
              <span className="capitalize">{spike.house}</span> · {spike.month} · {spike.category} · ${spike.amount.toLocaleString('en-US')}
              {spike.reason === 'multiple' ? ` · ${spike.ratio.toFixed(1)}× the usual` : ' · high for a quiet month'}
              {spike.receipt ? (
                <>
                  {' '}
                  <a href={`/api/expenses/${encodeURIComponent(spike.id)}/receipt`} className="underline">
                    Receipt
                  </a>
                </>
              ) : (
                ' · no receipt on file'
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
