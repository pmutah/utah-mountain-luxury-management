import { useMemo, useState } from 'react';
import {
  PROPERTIES,
  type GuestPreferenceAnswers,
  type GuestSurveyRecord,
  type Reservation,
} from '../lib/api';
import { currentDayIso } from '../lib/months';

function norm(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function daysUntil(iso: string) {
  const today = new Date(`${currentDayIso()}T00:00:00`).getTime();
  const then = new Date(`${iso}T00:00:00`).getTime();
  return Math.round((then - today) / 86400000);
}

function checklist(answers?: GuestPreferenceAnswers | null) {
  if (!answers) return ['No preference card on file yet.'];
  const lines: string[] = [];
  if (answers.houseTemp) lines.push(`Set the thermostat to ${answers.houseTemp}.`);
  if (answers.favoriteAlcohol || answers.alcoholPrefs) {
    lines.push(`Stock ${answers.favoriteAlcohol || answers.alcoholPrefs}.`);
  }
  if (answers.favoriteNaDrink || answers.naDrinkPrefs) {
    lines.push(`Have ${answers.favoriteNaDrink || answers.naDrinkPrefs} chilled.`);
  }
  if (answers.extraPillows) lines.push(`Extra pillows: ${answers.extraPillows}.`);
  if (answers.allergies) lines.push(`Allergies: ${answers.allergies}.`);
  if (answers.dogs && answers.dogs !== 'no') lines.push(`Dogs: ${answers.dogs}.`);
  if (answers.arrivalWindow) lines.push(`Arrival window: ${answers.arrivalWindow}.`);
  if (answers.smileItem) lines.push(`Leave ${answers.smileItem}.`);
  if (lines.length === 0) lines.push('Preference card is on file, with nothing to stage.');
  return lines;
}

function thankYou(name: string, property: string, checkIn: string, checkOut: string) {
  return `Dear ${name},\n\nThank you for staying at ${property} from ${checkIn} to ${checkOut}. The house is quieter without you. When you are ready to come back, tell us the dates and we will hold them.\n\nWith care,\nUtah Mountain Luxury`;
}

export function GuestDossier({
  reservations,
  surveys,
}: {
  reservations: Reservation[];
  surveys: GuestSurveyRecord[];
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const dossiers = useMemo(() => {
    const byGuest = new Map<string, { name: string; stays: Reservation[]; survey?: GuestSurveyRecord }>();
    for (const stay of reservations) {
      const key = norm(stay.guestName || 'guest');
      const row = byGuest.get(key) ?? { name: stay.guestName || 'Guest', stays: [] };
      row.stays.push(stay);
      byGuest.set(key, row);
    }
    for (const survey of surveys) {
      const key = norm(survey.guestName || '');
      const row = byGuest.get(key);
      if (row && (!row.survey || survey.completedAt)) row.survey = survey;
    }
    return [...byGuest.values()]
      .map((row) => ({
        ...row,
        stays: [...row.stays].sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
      }))
      .sort((a, b) => b.stays[0].checkIn.localeCompare(a.stays[0].checkIn))
      .slice(0, 8);
  }, [reservations, surveys]);

  if (dossiers.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <p className="uml-kicker">Guest dossiers</p>
        <h2 className="font-display text-3xl">How they like the house</h2>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {dossiers.map((guest) => {
          const latest = guest.stays[0];
          const property = PROPERTIES[latest.propertyId]?.name ?? latest.propertyId;
          const until = daysUntil(latest.checkIn);
          const answers = guest.survey?.answers;
          const note = thankYou(guest.name, property, latest.checkIn, latest.checkOut);
          const soon = until >= 0 && until <= 3;
          return (
            <article key={norm(guest.name)} className="uml-panel rounded-3xl p-5 space-y-3">
              <div className="flex justify-between gap-3">
                <div>
                  <h3 className="font-display text-2xl">{guest.name}</h3>
                  <p className="text-xs text-[var(--uml-muted)]">
                    {guest.stays.length} stay{guest.stays.length === 1 ? '' : 's'} · {property}
                  </p>
                </div>
                {soon && <p className="uml-kicker text-[var(--uml-gold)]">Arrives in {until}d</p>}
              </div>
              <ul className="text-sm space-y-1">
                {checklist(answers).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              {answers?.anythingElse && (
                <p className="text-sm italic text-[var(--uml-muted)]">“{answers.anythingElse}”</p>
              )}
              <button
                type="button"
                className="uml-nav"
                onClick={() => {
                  void navigator.clipboard.writeText(note).then(() => {
                    setCopied(guest.name);
                  });
                }}
              >
                {copied === guest.name ? 'Thank-you copied' : 'Copy thank-you note'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
