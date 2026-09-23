import type { HealthFactor } from '../lib/luxury';

export function HealthDial({
  score,
  size = 72,
  factors,
  ink = 'var(--uml-ink)',
}: {
  score: number;
  size?: number;
  factors?: HealthFactor[];
  ink?: string;
}) {
  const r = 28;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  return (
    <div className="inline-flex flex-col items-start gap-2">
      <svg width={size} height={size} viewBox="0 0 72 72" aria-label={`Health ${score}`}>
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(212,181,106,0.25)" strokeWidth="3" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="#d4b56a"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 36 36)"
        />
        <text x="36" y="40" textAnchor="middle" fill={ink} fontSize="16" fontFamily="Cormorant Garamond, serif">
          {score}
        </text>
      </svg>
      {factors && (
        <ul className="space-y-1">
          {factors.map((factor) => (
            <li key={factor.label}>
              <button
                type="button"
                className="text-left text-xs text-[var(--uml-muted)] hover:text-[var(--uml-gold)]"
                onClick={() =>
                  window.dispatchEvent(new CustomEvent('uml:command', { detail: { prompt: factor.ask } }))
                }
              >
                {factor.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
