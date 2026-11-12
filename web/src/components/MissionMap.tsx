import { useEffect, useRef } from 'react';
import { housePin } from '../lib/platform/back-office';
import { forecastLine, snowLine, useConditions } from '../lib/platform/use-conditions';

type Stay = { propertyId: string; checkIn: string; checkOut: string; status?: string };

const HOUSES = [
  { id: 'ranch', label: 'Ranch' },
  { id: 'lindon', label: 'Lindon' },
  { id: 'river', label: 'River' },
] as const;

/**
 * A terrain sketch of Lindon and Provo Canyon.
 *
 * Map tiles are not loaded. The snow and the road come from `GET /api/platform/conditions`, which reads the National Weather
 * Service and says plainly when a read failed — this used to print one fixed "not connected" sentence for each, so the desk
 * could not tell a calm night from a broken integration.
 */
export function MissionMap({ reservations, asOf }: { reservations: Stay[]; asOf: string }) {
  const conditions = useConditions();
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
      <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="mission-road">
        {conditions.kind === 'live'
          ? conditions.conditions.road.line
          : conditions.kind === 'off'
            ? 'Provo Canyon road status could not be read from this server. This is not a clear road.'
            : 'Reading the road…'}
      </p>
      <p className="text-xs text-[var(--uml-muted)]" data-bot="mission-snow" data-state={conditions.kind}>
        {conditions.kind === 'live'
          ? snowLine(conditions.conditions)
          : conditions.kind === 'off'
            ? 'Sundance snow could not be read. This is not clear weather.'
            : 'Reading the snow…'}
      </p>
      {conditions.kind === 'live' && conditions.conditions.plow.dispatch && (
        <p className="text-xs font-bold text-[#d4b56a]" data-bot="mission-plow">
          {conditions.conditions.plow.reason}
        </p>
      )}
      {conditions.kind === 'live' && conditions.conditions.alerts.length > 0 && (
        <p className="text-xs text-[var(--uml-muted)]" data-bot="mission-alerts">
          {conditions.conditions.alerts.map((alert) => alert.event).join(' · ')}
        </p>
      )}
      {conditions.kind === 'live' && conditions.conditions.sundance && conditions.conditions.sundance.days.length > 0 && (
        <p className="text-xs text-[var(--uml-muted)]" data-bot="mission-forecast">
          {forecastLine(conditions.conditions.sundance.days)}
        </p>
      )}
      {conditions.kind === 'live' && conditions.conditions.river && (
        <p className="text-xs text-[var(--uml-muted)]" data-bot="mission-river">
          {conditions.conditions.river.ok ? conditions.conditions.river.line : conditions.conditions.river.reason}
        </p>
      )}
    </div>
  );
}
