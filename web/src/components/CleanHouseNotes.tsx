import { useState } from 'react';
import { loadHouseFixes, saveHouseFixes, upsertHouseFix, type HouseFix } from '../lib/clean-notes';
import type { CleanLang } from '../lib/clean';
import type { HouseId } from '../lib/market/types';

const LABEL: Record<HouseId, string> = {
  river: 'The River House',
  ranch: 'The Ranch House',
  lindon: 'The Lindon House',
};

/** A house note with no stay attached. It stays in this browser and nothing is sent. */
export function HouseFixPad({ lang, houses }: { lang: CleanLang; houses: readonly HouseId[] }) {
  const [notes, setNotes] = useState<HouseFix[]>(loadHouseFixes);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState<string | null>(null);

  function save(house: HouseId) {
    const result = upsertHouseFix(notes, house, drafts[house] ?? notes.find((row) => row.house === house)?.note ?? '');
    if (result.refused) {
      setRefused(house);
      return;
    }
    setRefused(null);
    setNotes(result.notes);
    saveHouseFixes(result.notes);
    setDrafts((current) => ({ ...current, [house]: result.notes.find((row) => row.house === house)?.note ?? '' }));
  }

  return (
    <div className="uml-panel rounded-3xl p-6" data-bot="clean-house-notes">
      <p className="uml-kicker">{lang === 'es' ? 'Notas de la casa' : 'House notes'}</p>
      <p className="mt-2 text-sm text-[var(--uml-muted)]">
        {lang === 'es'
          ? 'Una nota para la casa cuando no hay una estancia en la lista. Se queda en este navegador. No se envía nada y no cambia una reserva ni un gasto.'
          : 'A note for the house when no stay is on the list. It stays in this browser. Nothing is sent, and it does not change a booking or an expense.'}
      </p>
      <div className="mt-4 space-y-4">
        {houses.map((house) => {
          const saved = notes.find((row) => row.house === house)?.note ?? '';
          const value = drafts[house] ?? saved;
          return (
            <label key={house} className="block text-sm">
              {LABEL[house]}
              <textarea
                className="mt-2 min-h-16 w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3"
                data-bot={`clean-house-note-${house}`}
                value={value}
                placeholder={lang === 'es' ? 'Se queda en este navegador.' : 'Stays in this browser.'}
                onChange={(event) => setDrafts((current) => ({ ...current, [house]: event.target.value }))}
              />
              <button
                type="button"
                className="uml-nav mt-2"
                data-bot={`clean-house-note-save-${house}`}
                onClick={() => save(house)}
              >
                {lang === 'es' ? 'Guardar en este navegador' : 'Save on this browser'}
              </button>
              {refused === house && (
                <p className="mt-2 text-sm" data-bot="clean-house-note-refused">
                  {lang === 'es' ? 'El código de la puerta y un precio no van en esta nota.' : 'A door code and a price stay off this note.'}
                </p>
              )}
              {saved && (
                <p className="mt-2 text-sm" data-bot="clean-house-note-saved" data-house={house}>
                  {saved}
                </p>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}
