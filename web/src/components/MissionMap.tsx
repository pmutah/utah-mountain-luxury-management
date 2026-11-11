import { useEffect, useRef } from 'react';
import { CANYON_STATUS, housePin, SNOW_STATUS } from '../lib/platform/back-office';

type Stay = { propertyId: string; checkIn: string; checkOut: string; status?: string };

const HOUSES = [
  { id: 'ranch', label: 'Ranch' },
  { id: 'lindon', label: 'Lindon' },
  { id: 'river', label: 'River' },
] as const;

/**
 * A terrain sketch of Lindon and Provo Canyon.
 * Map tiles are not loaded. Road status and snow are named as unconnected so the desk does not invent them.
 */
export function MissionMap({ reservations, asOf }: { reservations: Stay[]; asOf: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node) return;
    const ctx = node.getContext('2d');
    if (!ctx) return;
    const width = node.width;
    const height = node.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#102421';
    ctx.fillRect(0, 0, width, height);
    ctx.beginPath();
    ctx.moveTo(0, 190);
    ctx.lineTo(70, 150);
    ctx.lineTo(140, 170);
    ctx.lineTo(210, 90);
    ctx.lineTo(280, 70);
    ctx.lineTo(360, 110);
    ctx.lineTo(360, 220);
    ctx.lineTo(0, 220);
    ctx.closePath();
    ctx.fillStyle = '#1a3330';
    ctx.fill();
    ctx.strokeStyle = '#3d8f8a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, 180);
    ctx.bezierCurveTo(190, 140, 230, 120, 270, 86);
    ctx.stroke();
  }, []);

  return (
    <div className="mt-5" data-bot="mission-map">
      <p className="uml-kicker">The canyon</p>
      <div className="relative mt-3 overflow-hidden rounded-2xl border border-[var(--uml-line)]">
        <canvas ref={canvas} width={360} height={220} className="h-44 w-full" aria-hidden="true" />
        <ul className="absolute inset-x-3 bottom-3 flex flex-wrap gap-2">
          {HOUSES.map((house) => {
            const state = housePin(reservations, house.id, asOf);
            return (
              <li key={house.id} className="uml-live-pulse rounded-full bg-[var(--uml-bg)]/90 px-3 py-1 text-xs" data-bot={`mission-pin-${house.id}`} data-state={state}>
                {house.label} · {state}
              </li>
            );
          })}
        </ul>
      </div>
      <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="mission-road">{CANYON_STATUS}</p>
      <p className="text-xs text-[var(--uml-muted)]" data-bot="mission-snow">{SNOW_STATUS}</p>
    </div>
  );
}
