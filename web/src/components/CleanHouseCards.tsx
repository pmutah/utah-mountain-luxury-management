import { useEffect, useState } from 'react';
import { loadQuoteCalendar, type QuoteTurn } from '../lib/booked-nights';
import { cleanHouseCards, cleanTurnsLine } from '../lib/clean-ready';
import { cleanRouteForTurns } from '../lib/clean-route';
import { canyonFromTurns } from '../lib/turn-load';
import { cleanQuietLine, stepDone, type CleanLang } from '../lib/clean';
import { HouseFixPad } from './CleanHouseNotes';

const LANG_KEY = 'uml-clean-lang';

function loadLang(): CleanLang {
  try {
    return sessionStorage.getItem(LANG_KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

export function CleanHouseCards() {
  const [lang, setLang] = useState<CleanLang>(loadLang);
  const [turns, setTurns] = useState<QuoteTurn[] | null>(null);
  useEffect(() => {
    let cancel = false;
    loadQuoteCalendar()
      .then((calendar) => {
        if (!cancel) setTurns(calendar?.turns ?? null);
      })
      .catch(() => {
        if (!cancel) setTurns(null);
      });
    return () => {
      cancel = true;
    };
  }, []);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<Record<string, number>>({});
  const cards = cleanHouseCards(lang);

  function choose(next: CleanLang) {
    setLang(next);
    try {
      sessionStorage.setItem(LANG_KEY, next);
    } catch {
      /* the card still switches for this view */
    }
  }

  return (
    <section className="mt-6 space-y-4" data-bot="clean-ready" data-lang={lang}>
      <div className="flex flex-wrap gap-2" data-bot="clean-ready-lang">
        <button type="button" className="uml-nav" data-bot="clean-ready-en" aria-pressed={lang === 'en'} onClick={() => choose('en')}>
          English
        </button>
        <button type="button" className="uml-nav" data-bot="clean-ready-es" aria-pressed={lang === 'es'} onClick={() => choose('es')}>
          Español
        </button>
      </div>
      {turns && (
        <p className="text-sm" data-bot="clean-turns">
          {cleanTurnsLine(turns, lang)}
        </p>
      )}
      <p className="text-sm" data-bot="clean-route">
        {cleanRouteForTurns(turns, ['ranch', 'lindon', 'river'], lang)}
      </p>
      {canyonFromTurns(turns, lang).map((row) => (
        <p key={row.date || 'none'} className="text-sm" data-bot="clean-canyon" data-date={row.date || 'none'}>
          {row.line}
        </p>
      ))}
      <HouseFixPad lang={lang} houses={['river', 'ranch', 'lindon']} />
      {cards.map((card) => (
        <article key={card.house} className="uml-panel rounded-3xl p-6" data-bot="clean-ready-card" data-house={card.house}>
          <p className="uml-kicker">{card.name}</p>
          <p className="mt-2 text-sm" data-bot="clean-ready-unread">
            {turns
              ? lang === 'es'
                ? 'Esta tarjeta no nombra una estancia.'
                : 'This card does not name a stay.'
              : card.unread}
          </p>
          <p className="mt-2 text-sm" data-bot="clean-ready-prep">
            {card.prep}
          </p>
          <p className="mt-2 text-sm" data-bot="clean-ready-quiet">
            {cleanQuietLine(card.house, lang)}
          </p>
          <p className="mt-2 text-sm" data-bot="clean-ready-clock">
            {card.clock}
          </p>
          <p className="mt-2 text-sm" data-bot="clean-ready-when">
            {card.when}
          </p>
          <p className="mt-2 text-sm" data-bot="clean-ready-place">
            {card.place}
          </p>
          {card.essentials.length > 0 && (
            <div className="mt-3" data-bot="clean-ready-essentials" data-house={card.house}>
              <p className="text-sm text-[var(--uml-muted)]">
                {lang === 'es' ? 'Antes de ir. Es para el camino, no es tu lista.' : 'Before you go. This is for the drive, not your checklist.'}
              </p>
              <ul className="mt-1 space-y-1 text-sm">
                {card.essentials.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-3 text-sm" data-bot="clean-ready-event" data-house={card.house}>
            {card.event}
          </p>
          <p className="mt-3 text-sm" data-bot="clean-ready-safety" data-house={card.house}>
            {card.safety}
          </p>
          <ul className="mt-3 space-y-1 text-sm" data-bot="clean-ready-rules">
            {card.rules.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1 text-sm" data-bot="clean-ready-notes">
            {card.notes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1 text-sm" data-bot="clean-ready-leaving">
            {card.leaving.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <ul className="mt-3 space-y-1 text-sm" data-bot="clean-ready-steps">
            {card.steps.map((step) => {
              const key = `${card.house}:${step.id}`;
              const photoCount = photos[card.house] ?? 0;
              const done = stepDone(step.id, Boolean(checks[key]), photoCount);
              return (
                <li key={step.id}>
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      data-bot="clean-ready-step"
                      data-step={step.id}
                      data-house={card.house}
                      data-done={done ? 'yes' : 'no'}
                      checked={done}
                      onChange={() => {
                        if (step.id === 'photos' && photoCount === 0) return;
                        setChecks((current) => ({ ...current, [key]: !current[key] }));
                      }}
                    />
                    <span>{step.label}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <label className="mt-3 block text-sm">
            <span className="text-[var(--uml-muted)]">
              {lang === 'es' ? 'Foto de un cuarto' : 'A room photo'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="mt-2 block w-full text-sm"
              data-bot="clean-ready-photo"
              data-house={card.house}
              onChange={(event) => {
                const count = event.target.files?.length ?? 0;
                setPhotos((current) => ({ ...current, [card.house]: count }));
              }}
            />
          </label>
          {card.photoGuide && (
            <p className="mt-2 text-sm" data-bot="clean-ready-photo-guide" data-house={card.house}>
              {card.photoGuide}
            </p>
          )}
          <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="clean-ready-photo-note" data-house={card.house}>
            {(photos[card.house] ?? 0) > 0
              ? lang === 'es'
                ? `${photos[card.house]} en esta pestaña. No se sube.`
                : `${photos[card.house]} in this tab. Not uploaded.`
              : lang === 'es'
                ? 'La foto de los cuartos se queda en esta pestaña. No se sube. Ese paso sigue abierto hasta que haya una foto.'
                : 'A room photo stays in this tab. It is not uploaded. That step stays open until a photo is here.'}
          </p>
        </article>
      ))}
    </section>
  );
}
