import { useState } from 'react';
import { pinsFor, type MapPinKind } from '../lib/canyon-map';

export function CanyonPocketMap({ house }: { house: 'ranch' | 'lindon' | 'river' }) {
  const [kind, setKind] = useState<MapPinKind | 'all'>('all');
  const [active, setActive] = useState<string>('vivian');
  const pins = pinsFor(kind);
  const chosen = pins.find((pin) => pin.id === active) ?? pins.find((pin) => pin.kind === kind) ?? pins[0];
  return (
    <section className="uml-panel rounded-3xl p-5" data-bot="canyon-map">
      <p className="uml-kicker">The canyon</p>
      <h2 className="font-display text-3xl mt-1">Utah Lake to Sundance</h2>
      <p className="mt-2 text-sm text-[var(--uml-muted)]">Drive minutes are typical, not live traffic.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(['all', 'ski', 'river', 'food', 'trails'] as const).map((item) => (
          <button key={item} type="button" className="uml-nav" aria-pressed={kind === item} onClick={() => setKind(item)}>
            {item}
          </button>
        ))}
      </div>
      <svg viewBox="0 0 560 260" className="mt-4 w-full" role="img" aria-label="Canyon map">
        <path d="M40 220 C 140 180, 220 150, 360 90 S 500 40, 530 30" fill="none" stroke="var(--uml-glacier)" strokeWidth="8" />
        <path d="M20 230 C 180 200, 260 160, 400 120" fill="none" stroke="var(--uml-gold)" strokeWidth="2" opacity="0.7" />
        {pins.map((pin) => (
          <g key={pin.id} onClick={() => setActive(pin.id)} style={{ cursor: 'pointer' }}>
            <circle cx={pin.x} cy={pin.y} r={pin.id === house || pin.id === 'vivian' && house === 'river' ? 9 : 6} fill={active === pin.id ? 'var(--uml-gold)' : 'var(--uml-ink)'} />
            <text x={pin.x + 10} y={pin.y - 8} fill="var(--uml-ink)" fontSize="11">
              {pin.name.split('—')[0]}
            </text>
          </g>
        ))}
      </svg>
      {chosen ? (
        <p className="mt-2 text-sm" data-bot="canyon-pin">
          {chosen.name}. About {chosen.minutes[house]} minutes from this house. {chosen.note}
        </p>
      ) : null}
    </section>
  );
}
