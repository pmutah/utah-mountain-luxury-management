import { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import type { PricingAlert } from '../lib/agent-types';

export function PricingWatch({ onError }: { onError: (msg: string) => void }) {
  const [alerts, setAlerts] = useState<PricingAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getPricingAlerts()
      .then((r) => setAlerts(r.alerts))
      .catch((e) => onError(e instanceof Error ? e.message : 'Failed to load pricing alerts'))
      .finally(() => setLoading(false));
  }, [onError]);

  if (loading) return null;
  if (alerts.length === 0) return null;

  return (
    <section className="bg-slate-900 rounded-[40px] border border-slate-800 overflow-hidden shadow-xl p-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-5 h-5 text-amber-400" />
        <h4 className="text-sm font-black uppercase tracking-widest text-white">Pricing watch</h4>
      </div>
      <ul className="space-y-3">
        {alerts.slice(0, 5).map((a) => (
          <li
            key={a.id}
            className="text-sm text-slate-300 border-b border-slate-800/50 pb-3 last:border-0"
          >
            <span className="text-[10px] font-bold uppercase text-amber-500/90">{a.propertyId}</span>
            <p className="mt-1">{a.message}</p>
            {a.suggestedAction && (
              <p className="text-xs text-slate-500 mt-1">{a.suggestedAction}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
