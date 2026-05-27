import type { ToolStep } from '../lib/agent-types';

export function AgentToolSteps({ steps, loading }: { steps: ToolStep[]; loading: boolean }) {
  if (!loading && steps.length === 0) return null;

  return (
    <div className="px-4 py-2 bg-slate-950/80 border-t border-slate-800 text-xs">
      {loading && steps.length === 0 && (
        <p className="text-slate-400 animate-pulse">Co-host is thinking…</p>
      )}
      <ul className="space-y-1">
        {steps.map((s, i) => (
          <li key={`${s.tool}-${i}`} className="text-emerald-400/90 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            {s.summary}
          </li>
        ))}
        {loading && steps.length > 0 && (
          <li className="text-slate-500 animate-pulse">Finishing up…</li>
        )}
      </ul>
    </div>
  );
}
