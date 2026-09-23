import { formatCurrency, type PortfolioData } from '../lib/api';
import { formatWhole, hostPayout, waterfallBands, type HouseId } from '../lib/luxury';

export function MoneyWaterfall({ data, only }: { data: PortfolioData; only?: HouseId }) {
  const all = waterfallBands(data, only);
  const bands = all.filter((b) => b.value > 0);
  const quiet = all.filter((b) => b.value <= 0);
  const payout = hostPayout(data, only);
  const total = bands.reduce((s, b) => s + b.value, 0) || 1;
  const H = 220;
  let left = 8;
  let right = 8;
  const ribbons = bands.map((band) => {
    const h = Math.max(10, (band.value / total) * H);
    const shape = { band, h, left, right };
    left += h;
    right += h;
    return shape;
  });

  return (
    <section className="uml-panel rounded-3xl p-6 sm:p-8">
      <p className="uml-kicker">Where the money goes</p>
      <h2 className="font-display text-3xl mt-1">From host payout to partners</h2>
      <p className="text-sm text-[var(--uml-muted)] mt-2 max-w-xl">
        Ranch and River pay a 20% management fee to Brandon, then split what remains 50/50 with Todd.
        Lindon stays with Brandon. Hover a ribbon for the dollars behind it.
      </p>
      <div className="mt-6 overflow-x-auto">
        <svg viewBox="0 0 640 280" className="w-full min-w-[520px]" role="img" aria-label="Owner distribution">
          <text x="16" y="20" fill="var(--uml-muted)" fontSize="11">
            Host payout {formatWhole(payout)}
          </text>
          {ribbons.map(({ band, h, left: y0, right: y1 }) => {
            const d = `M 36 ${y0 + 28} C 180 ${y0 + 28}, 180 ${y1 + 28}, 300 ${y1 + 28} L 300 ${y1 + h + 28} C 180 ${y1 + h + 28}, 180 ${y0 + h + 28}, 36 ${y0 + h + 28} Z`;
            return (
              <path key={band.key} d={d} fill={band.color} opacity="0.9">
                <title>{`${band.label}: ${formatCurrency(band.value)}`}</title>
              </path>
            );
          })}
        </svg>
      </div>
      <ul className="grid sm:grid-cols-2 gap-2 mt-2">
        {bands.map((band) => (
          <li key={band.key} className="text-xs text-[var(--uml-muted)]">
            <span className="text-[var(--uml-ink)]">{band.label}.</span> {band.detail}. {formatCurrency(band.value)}
          </li>
        ))}
        {quiet.map((band) => (
          <li key={band.key} className="text-xs text-[var(--uml-muted)]">
            <span className="text-[var(--uml-ink)]">{band.label}.</span> {formatCurrency(band.value)} this month.
          </li>
        ))}
      </ul>
    </section>
  );
}
