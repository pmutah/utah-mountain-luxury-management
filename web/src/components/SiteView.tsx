import { useEffect, useState } from 'react';
import { api, PROPERTIES, type ConstructionProject } from '../lib/api';
import { CONSTRUCTION_STAGES } from '../lib/construction-stages';
import type { HouseId } from '../lib/luxury';

const PINS: Array<{ id: HouseId | 'build'; x: number; y: number; label: string }> = [
  { id: 'ranch', x: 168, y: 214, label: 'Ranch' },
  { id: 'lindon', x: 214, y: 186, label: 'Lindon' },
  { id: 'river', x: 470, y: 132, label: 'River' },
];

export function SiteView({
  onOpen,
}: {
  onOpen: (id: HouseId | 'build') => void;
}) {
  const [project, setProject] = useState<ConstructionProject | null>(null);

  useEffect(() => {
    api.getConstructionProject().then(setProject).catch(() => setProject(null));
  }, []);

  const stageIndex = CONSTRUCTION_STAGES.findIndex(
    (stage) => stage.toLowerCase() === (project?.currentStage ?? '').toLowerCase(),
  );
  const progress = stageIndex < 0 ? 0 : Math.round(((stageIndex + 1) / CONSTRUCTION_STAGES.length) * 100);

  return (
    <section id="site-view" className="uml-panel rounded-3xl p-6 sm:p-8">
      <p className="uml-kicker">The land</p>
      <h2 className="font-display text-3xl mt-1">Wasatch bench</h2>
      <p className="text-sm text-[var(--uml-muted)] mt-2 max-w-xl">
        Ranch and Lindon sit together in the valley. River is up Provo Canyon at Vivian Park. Select a pin to open the house.
      </p>
      <svg viewBox="0 0 720 360" className="w-full mt-4 rounded-2xl bg-[#0c1c19]" role="img" aria-label="Stylized map of the properties">
        <path d="M0 250 C80 180 140 210 210 150 C280 90 340 130 420 80 C500 30 560 90 640 60 L720 40 V360 H0 Z" fill="#14302c" />
        <path d="M0 280 C140 250 200 300 340 270 C500 236 580 290 720 250 V360 H0 Z" fill="#1d4038" />
        <path d="M380 40 C420 120 400 180 460 230 C500 260 540 250 590 300" fill="none" stroke="#7ec8c2" strokeWidth="3" opacity="0.8" />
        <text x="24" y="36" fill="#8fa39c" fontSize="12">Utah Valley</text>
        <text x="520" y="78" fill="#8fa39c" fontSize="12">Provo Canyon</text>
        {PINS.map((pin) => (
          <g key={pin.id} className="cursor-pointer" onClick={() => onOpen(pin.id === 'river' ? 'river' : pin.id)}>
            <circle cx={pin.x} cy={pin.y} r="7" fill="#d4b56a" />
            <circle cx={pin.x} cy={pin.y} r="14" fill="none" stroke="#d4b56a" strokeWidth="1" opacity="0.7" />
            <text x={pin.x + 18} y={pin.y + 4} fill="#f4f1ea" fontSize="14" fontFamily="Cormorant Garamond, serif">
              {pin.label}
            </text>
          </g>
        ))}
      </svg>
      <div className="mt-4 flex flex-wrap gap-3">
        {(['ranch', 'lindon', 'river'] as const).map((id) => (
          <button key={id} type="button" className="uml-nav" onClick={() => onOpen(id)}>
            {PROPERTIES[id].name.replace('The ', '')}
          </button>
        ))}
      </div>
      <div className="mt-6 border-t border-[var(--uml-line)] pt-4">
        <p className="uml-kicker">River build</p>
        <p className="font-display text-2xl mt-1">{project?.currentStage ?? 'Stage not loaded'}</p>
        <div className="mt-3 h-px bg-[var(--uml-line)] relative">
          <div className="absolute inset-y-[-1px] left-0 bg-[var(--uml-gold)]" style={{ width: `${progress}%`, height: 3 }} />
        </div>
        <ol className="mt-3 flex gap-3 overflow-x-auto text-[10px] uppercase tracking-widest text-[var(--uml-muted)]">
          {CONSTRUCTION_STAGES.map((stage, i) => (
            <li key={stage} className={stageIndex >= 0 && i <= stageIndex ? 'text-[var(--uml-gold)]' : ''}>
              {stage}
            </li>
          ))}
        </ol>
        <button type="button" className="uml-nav mt-3" onClick={() => onOpen('build')}>
          Open build costs
        </button>
      </div>
    </section>
  );
}
