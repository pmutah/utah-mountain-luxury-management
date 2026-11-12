import { useState } from 'react';
import { Camera, Car, Compass, ExternalLink, MapPin as MapPinIcon, Mountain, Navigation } from 'lucide-react';
import {
  appleDirectionsUrl,
  CANYON_LIVE_PORTALS,
  googleDirectionsUrl,
  HOUSE_DESTINATION_QUERY,
  pinsFor,
  TRAVEL_ORIGINS,
  type MapPinKind,
} from '../lib/canyon-map';

import { CanyonCameras } from './CanyonCameras';
import { SnowReport } from './SnowReport';

type ViewMode = 'map' | 'directions' | 'cams';

export function CanyonPocketMap({ house }: { house: 'ranch' | 'lindon' | 'river' }) {
  const [mode, setMode] = useState<ViewMode>('map');
  const [kind, setKind] = useState<MapPinKind | 'all'>('all');
  const [active, setActive] = useState<string>(house === 'river' ? 'vivian' : house);
  const [originId, setOriginId] = useState<string>('slc');

  const pins = pinsFor(kind);
  const chosen = pins.find((pin) => pin.id === active) ?? pins.find((pin) => pin.kind === kind) ?? pins[0];
  const selectedOrigin = TRAVEL_ORIGINS.find((row) => row.id === originId) ?? TRAVEL_ORIGINS[0]!;
  const houseDest = HOUSE_DESTINATION_QUERY[house];

  return (
    <section className="uml-panel rounded-3xl p-5 sm:p-6" data-bot="canyon-map">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="uml-kicker">The canyon &amp; arrival</p>
          <h2 className="font-display text-3xl mt-1">Utah Lake to Sundance Summit</h2>
          <p className="mt-1 text-sm text-[var(--uml-muted)]">
            Drive minutes are typical planning figures, not live traffic. Check UDOT before driving in winter weather.
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Area explorer views">
          {(
            [
              ['map', 'Elevation Map', Mountain],
              ['directions', 'Directions & Airports', Car],
              ['cams', 'Live Cams & Roads', Camera],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              data-bot={`canyon-tab-${id}`}
              onClick={() => setMode(id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition-colors ${
                mode === id
                  ? 'bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold'
                  : 'border border-[var(--uml-line)] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'map' && (
        <>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {(
              [
                ['all', 'All landmarks'],
                ['ski', 'Ski'],
                ['river', 'River & lake'],
                ['food', 'Dining & shops'],
                ['trails', 'Waterfalls & trails'],
              ] as const
            ).map(([item, label]) => (
              <button
                key={item}
                type="button"
                className="uml-nav"
                aria-pressed={kind === item}
                onClick={() => setKind(item)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-3">
            <svg viewBox="0 0 560 250" className="w-full" role="img" aria-label="Topographic canyon map from Utah Lake to Sundance">
              <defs>
                <linearGradient id="canyonTerrain" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--uml-glacier)" stopOpacity="0.16" />
                  <stop offset="100%" stopColor="var(--uml-gold)" stopOpacity="0.08" />
                </linearGradient>
              </defs>

              {/* Elevation grid lines */}
              <line x1="20" y1="55" x2="540" y2="55" stroke="var(--uml-line)" strokeDasharray="3 5" strokeWidth="0.8" />
              <text x="24" y="50" fill="var(--uml-muted)" fontSize="9">8,250 ft · Mt. Timpanogos / Sundance Ridge</text>

              <line x1="20" y1="125" x2="540" y2="125" stroke="var(--uml-line)" strokeDasharray="3 5" strokeWidth="0.8" />
              <text x="24" y="120" fill="var(--uml-muted)" fontSize="9">5,260 ft · Provo Canyon / Vivian Park</text>

              <line x1="20" y1="215" x2="540" y2="215" stroke="var(--uml-line)" strokeDasharray="3 5" strokeWidth="0.8" />
              <text x="24" y="232" fill="var(--uml-muted)" fontSize="9">4,640 ft · Utah Valley / Lindon</text>

              {/* Mountain silhouette */}
              <path
                d="M 20 222 L 95 202 L 165 182 L 245 144 L 340 108 L 430 84 L 515 36 L 545 55 L 545 235 L 20 235 Z"
                fill="url(#canyonTerrain)"
              />

              {/* Provo River water ribbon */}
              <path
                d="M 48 220 C 145 190, 235 154, 365 100 S 465 68, 520 40"
                fill="none"
                stroke="var(--uml-glacier)"
                strokeWidth="6"
                strokeLinecap="round"
                opacity="0.75"
              />

              {/* US-189 / SR-92 highway line */}
              <path
                d="M 35 226 C 155 196, 245 160, 370 105 S 475 72, 512 46"
                fill="none"
                stroke="var(--uml-gold)"
                strokeWidth="2"
                strokeDasharray="5 3"
                opacity="0.85"
              />

              {pins.map((pin) => {
                const isThisHouse = pin.id === house || (pin.id === 'vivian' && house === 'river');
                const isSelected = chosen?.id === pin.id;
                return (
                  <g
                    key={pin.id}
                    onClick={() => setActive(pin.id)}
                    style={{ cursor: 'pointer' }}
                    role="button"
                    tabIndex={0}
                    aria-label={`${pin.name}, ${pin.elevationFt} feet`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setActive(pin.id);
                      }
                    }}
                  >
                    {isSelected && (
                      <circle
                        cx={pin.x}
                        cy={pin.y}
                        r={14}
                        fill="none"
                        stroke="var(--uml-gold)"
                        strokeWidth="1.5"
                        opacity="0.65"
                      />
                    )}
                    <circle
                      cx={pin.x}
                      cy={pin.y}
                      r={isThisHouse ? 8.5 : 6}
                      fill={isSelected ? 'var(--uml-gold)' : isThisHouse ? 'var(--uml-glacier)' : 'var(--uml-ink)'}
                      stroke="var(--uml-bg)"
                      strokeWidth="2"
                    />
                    <text
                      x={pin.x > 430 ? pin.x - 8 : pin.x + 11}
                      y={pin.y - 9}
                      textAnchor={pin.x > 430 ? 'end' : 'start'}
                      fill="var(--uml-ink)"
                      fontSize="11"
                      fontWeight={isSelected || isThisHouse ? '600' : '400'}
                    >
                      {pin.name.split('—')[0]?.trim()}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {chosen ? (
            <div
              className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--uml-line)] px-4 py-3"
              data-bot="canyon-pin"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <MapPinIcon className="h-4 w-4 text-[var(--uml-gold)]" aria-hidden="true" />
                  <p className="text-sm font-semibold">{chosen.name}</p>
                  <span className="rounded-full border border-[var(--uml-line)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--uml-muted)] uml-num">
                    {chosen.elevationFt.toLocaleString()} ft · {chosen.corridor}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--uml-muted)]">
                  {chosen.minutes[house] === 0
                    ? `Right at this property. ${chosen.note}`
                    : `About ${chosen.minutes[house]} minutes from this house. ${chosen.note}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <a
                  href={googleDirectionsUrl(houseDest, chosen.mapsQuery)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-line)] px-3 py-1.5 text-xs hover:border-[var(--uml-gold)] hover:text-[var(--uml-gold)] transition-colors"
                  data-bot="canyon-pin-directions"
                >
                  <Navigation className="h-3 w-3" aria-hidden="true" />
                  Route in Google Maps
                </a>
                <a
                  href={appleDirectionsUrl(houseDest, chosen.mapsQuery)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--uml-line)] px-3 py-1.5 text-xs hover:border-[var(--uml-gold)] hover:text-[var(--uml-gold)] transition-colors"
                >
                  Apple Maps
                </a>
              </div>
            </div>
          ) : null}
        </>
      )}

      {mode === 'directions' && (
        <div className="mt-4 space-y-4" data-bot="canyon-directions-panel">
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--uml-muted)]">
              Choose where you are arriving from
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TRAVEL_ORIGINS.map((origin) => (
                <button
                  key={origin.id}
                  type="button"
                  aria-pressed={originId === origin.id}
                  data-bot={`canyon-origin-${origin.id}`}
                  onClick={() => setOriginId(origin.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                    originId === origin.id
                      ? 'border-[var(--uml-gold)] bg-[var(--uml-gold)] text-[var(--uml-gold-ink)] font-semibold'
                      : 'border-[var(--uml-line)] text-[var(--uml-muted)] hover:text-[var(--uml-ink)]'
                  }`}
                >
                  {origin.code ? `${origin.code} · ${origin.label.split(' ')[0]}` : origin.label.split('(')[0]?.trim()}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/55 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="uml-kicker">Turn-by-turn corridor</p>
                <h3 className="font-display text-2xl mt-0.5">{selectedOrigin.label}</h3>
              </div>
              <p className="font-display text-2xl text-[var(--uml-gold)] uml-num">
                ~{selectedOrigin.minutesTo[house]} min · {selectedOrigin.milesTo[house]} mi
              </p>
            </div>

            <p className="mt-2 text-sm">
              <span className="text-[var(--uml-muted)]">Recommended route:</span> {selectedOrigin.routeTo[house]}
            </p>
            <p className="mt-1.5 text-xs text-[var(--uml-muted)]">{selectedOrigin.winterNote}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={googleDirectionsUrl(selectedOrigin.originQuery, houseDest)}
                target="_blank"
                rel="noreferrer"
                className="uml-gold-btn inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs uppercase tracking-[0.14em]"
                data-bot="canyon-google-nav"
              >
                <Navigation className="h-3.5 w-3.5" aria-hidden="true" />
                Open Google Maps Directions
              </a>
              <a
                href={appleDirectionsUrl(selectedOrigin.originQuery, houseDest)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--uml-line)] px-4 py-2 text-xs uppercase tracking-[0.14em] hover:border-[var(--uml-gold)]"
                data-bot="canyon-apple-nav"
              >
                <Compass className="h-3.5 w-3.5" aria-hidden="true" />
                Open Apple Maps
              </a>
            </div>
          </div>

          {/* Full drive matrix at a glance */}
          <div className="overflow-x-auto rounded-2xl border border-[var(--uml-line)]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--uml-line)] text-[10px] uppercase tracking-[0.16em] text-[var(--uml-muted)]">
                  <th className="px-3.5 py-2.5">Origin</th>
                  <th className="px-3 py-2.5 text-right">Typical time</th>
                  <th className="px-3 py-2.5 text-right">Distance</th>
                  <th className="px-3.5 py-2.5 text-right">Directions</th>
                </tr>
              </thead>
              <tbody>
                {TRAVEL_ORIGINS.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--uml-line)]/50 last:border-0">
                    <td className="px-3.5 py-2 font-medium">{row.label}</td>
                    <td className="px-3 py-2 text-right uml-num">~{row.minutesTo[house]} min</td>
                    <td className="px-3 py-2 text-right text-[var(--uml-muted)] uml-num">{row.milesTo[house]} mi</td>
                    <td className="px-3.5 py-2 text-right">
                      <a
                        href={googleDirectionsUrl(row.originQuery, houseDest)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--uml-gold)] underline"
                      >
                        Map →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {mode === 'cams' && (
        <div className="mt-4">
          <CanyonCameras house={house} />
          <div className="mt-5 border-t border-white/10 pt-4">
            <SnowReport />
          </div>
          <p className="uml-kicker mt-5">Reports & condition pages</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2" data-bot="canyon-cams-panel">
            {CANYON_LIVE_PORTALS.map((portal) => (
            <a
              key={portal.id}
              href={portal.href}
              target="_blank"
              rel="noreferrer"
              data-bot={`canyon-portal-${portal.id}`}
              className="group flex flex-col justify-between rounded-2xl border border-[var(--uml-line)] bg-[var(--uml-surface-2)]/50 p-4 transition hover:border-[var(--uml-gold)]"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="uml-kicker text-[var(--uml-gold)]">{portal.provider}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-[var(--uml-muted)] group-hover:text-[var(--uml-gold)]" aria-hidden="true" />
                </div>
                <p className="mt-1.5 text-sm font-semibold">{portal.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-[var(--uml-muted)]">{portal.detail}</p>
              </div>
              <span className="mt-3 inline-block text-[11px] uppercase tracking-[0.14em] text-[var(--uml-gold)]">
                Open live feed →
              </span>
            </a>
          ))}
          </div>
        </div>
      )}
    </section>
  );
}
