import { useEffect, useMemo, useRef, useState } from 'react';
import type { Reservation } from '../lib/api';
import { cleanJobs, cleanLabel, jobDoneCount, stepDone, workOrderEssentials, workOrderLeaving, workOrderMap, workOrderNotes, workOrderPlace, workOrderRules, workOrderNext, workOrderParty, workOrderArrival, workOrderDeparture, workOrderCheckoutParty, workOrderLaterLeave, workOrderWhen, type CleanLang } from '../lib/clean';
import { loadBookedNights } from '../lib/booked-nights';
import { checkoutNightIsFree } from '../lib/journey';
import type { HouseId } from '../lib/market/types';
import { usePreferenceTimes } from '../hooks/useArrivalWindows';
import { loadCleanFixes, saveCleanFixes, upsertCleanFix, type CleanFix } from '../lib/clean-notes';
import { currentDayIso } from '../lib/months';

type OpenTask = {
  id: string;
  propertyId: string;
  dueDate: string;
  status: string;
  type: string;
  notes?: string;
};

const CHECKS_KEY = 'uml-clean-checks';
const LANG_KEY = 'uml-clean-lang';

function loadLang(): CleanLang {
  try {
    return sessionStorage.getItem(LANG_KEY) === 'es' ? 'es' : 'en';
  } catch {
    return 'en';
  }
}

function loadChecks(): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(CHECKS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function gapLabel(gap: number | null, lang: CleanLang) {
  if (gap === null) {
    return lang === 'es' ? 'No hay otra llegada después de esta salida.' : 'Nothing booked after this checkout.';
  }
  if (gap === 0) {
    return lang === 'es' ? 'Limpieza el mismo día. El siguiente huésped llega hoy.' : 'Same-day clean. Next guest arrives today.';
  }
  if (lang === 'es') return gap === 1 ? '1 noche antes de la siguiente llegada.' : `${gap} noches antes de la siguiente llegada.`;
  return `${gap} night${gap === 1 ? '' : 's'} before the next arrival.`;
}

export function CleanDesk({ reservations }: { reservations: Reservation[] }) {
  const asOf = currentDayIso();
  const jobs = useMemo(() => cleanJobs(reservations, asOf), [reservations, asOf]);
  const preferenceTimes = usePreferenceTimes();
  const [taken, setTaken] = useState<Record<HouseId, string[]> | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecks);
  const [tasks, setTasks] = useState<OpenTask[]>([]);
  const [lang, setLang] = useState<CleanLang>(loadLang);
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  const [fixes, setFixes] = useState<CleanFix[]>(loadCleanFixes);
  const photosRef = useRef(photos);

  useEffect(() => {
    return () => {
      Object.values(photosRef.current).flat().forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    loadBookedNights()
      .then((nights) => {
        if (!cancel) setTaken(nights);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    let cancel = false;
    fetch('/api/operations/tasks')
      .then(async (response) => {
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !type.includes('application/json')) return null;
        return (await response.json()) as { tasks?: OpenTask[] };
      })
      .then((body) => {
        if (cancel || !body?.tasks) return;
        setTasks(body.tasks.filter((task) => task.status === 'pending'));
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  function chooseLang(next: CleanLang) {
    setLang(next);
    try {
      sessionStorage.setItem(LANG_KEY, next);
    } catch {
      // The labels still switch for this visit.
    }
  }

  function writeFix(jobId: string, house: string, checkout: string, note: string) {
    const next = upsertCleanFix(fixes, { id: jobId, house, checkout, note });
    setFixes(next);
    saveCleanFixes(next);
  }

  function addPhoto(jobId: string, file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setPhotos((current) => {
      const next = { ...current, [jobId]: [...(current[jobId] ?? []), url] };
      photosRef.current = next;
      return next;
    });
  }

  function toggle(jobId: string, stepId: string) {
    if (stepId === 'photos' && (photos[jobId]?.length ?? 0) === 0) return;
    setChecks((current) => {
      const next = { ...current, [`${jobId}:${stepId}`]: !current[`${jobId}:${stepId}`] };
      sessionStorage.setItem(CHECKS_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <section className="space-y-6" data-bot="clean-desk">
      <div>
        <p className="uml-kicker">Clean</p>
        <h2 className="font-display text-5xl">The next two weeks</h2>
        <p className="mt-2 max-w-2xl text-sm text-[var(--uml-muted)]">
          {lang === 'es'
            ? 'Las salidas salen de las reservas que ya están en el calendario. Las marcas se quedan en este navegador. Una foto se queda en esta pestaña y no se sube. No cambia una reserva ni un gasto.'
            : 'Turnovers come from the bookings already on the calendar. Checks stay on this browser. A room photo stays in this tab and is not uploaded. A fix note stays in this browser and does not create a task. They do not change a booking or an expense.'}
        </p>
        <div className="mt-4 flex flex-wrap gap-2" data-bot="clean-lang" data-print-hide>
          <button type="button" className="uml-nav" data-bot="clean-lang-en" aria-pressed={lang === 'en'} onClick={() => chooseLang('en')}>
            English
          </button>
          <button type="button" className="uml-nav" data-bot="clean-lang-es" aria-pressed={lang === 'es'} onClick={() => chooseLang('es')}>
            Español
          </button>
          <button type="button" className="uml-nav" data-bot="clean-print" onClick={() => window.print()}>
            {lang === 'es' ? 'Imprimir' : 'Print'}
          </button>
        </div>
      </div>
      {jobs.length === 0 ? (
        <p className="uml-panel rounded-3xl p-6 text-sm text-[var(--uml-muted)]">No checkouts in the next two weeks.</p>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const photoCount = photos[job.id]?.length ?? 0;
            const done = jobDoneCount(job.steps, checks, job.id, photoCount);
            return (
              <article key={job.id} className="uml-panel rounded-3xl p-6" data-bot="clean-job">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="uml-kicker">{job.priority ? (lang === 'es' ? 'Mismo día' : 'Same-day') : job.house}</p>
                    <h3 className="font-display text-4xl">{job.houseName}</h3>
                    <p className="mt-1 text-sm text-[var(--uml-muted)]">
                      {shortDate(job.checkout)} · {gapLabel(job.gapNights, lang)}
                    </p>
                    <p className="mt-1 text-sm" data-bot="clean-window">
                      {workOrderWhen(job.house, job.priority, lang)}
                    </p>
                    <p className="mt-1 text-sm" data-bot="clean-checkout-party">
                      {workOrderCheckoutParty(job.checkoutGuests, lang, job.checkoutChildren)}
                    </p>
                    {preferenceTimes && (
                      <p className="mt-1 text-sm" data-bot="clean-departure">
                        {workOrderDeparture(preferenceTimes.departure[job.checkoutStayId], lang)}
                      </p>
                    )}
                    {taken && (
                      <p className="mt-1 text-sm" data-bot="clean-later-leave">
                        {workOrderLaterLeave(checkoutNightIsFree(job.checkout, taken[job.house] ?? []), lang)}
                      </p>
                    )}
                    <p className="mt-1 text-sm" data-bot="clean-next">
                      {workOrderNext(job.nextCheckIn, job.gapNights, lang)}
                    </p>
                    {job.nextCheckIn && (
                      <p className="mt-1 text-sm" data-bot="clean-party">
                        {workOrderParty(job.nextGuests, lang, job.nextChildren)}
                      </p>
                    )}
                    {job.nextCheckIn && preferenceTimes && (
                      <p className="mt-1 text-sm" data-bot="clean-arrival">
                        {workOrderArrival(preferenceTimes.arrival[job.nextStayId ?? ''], lang)}
                      </p>
                    )}
                    <p className="mt-1 text-sm" data-bot="clean-place">
                      <a href={workOrderMap(job.house)} target="_blank" rel="noreferrer" data-bot="clean-map">
                        {workOrderPlace(job.house, lang)}
                      </a>
                    </p>
                    {workOrderEssentials(job.house).length > 0 && (
                      <div className="mt-2" data-bot="clean-essentials">
                        <p className="text-sm text-[var(--uml-muted)]">
                          {lang === 'es' ? 'Antes de ir. Es para el camino, no es tu lista.' : 'Before you go. This is for the drive, not your checklist.'}
                        </p>
                        <ul className="mt-1 space-y-1 text-sm">
                          {workOrderEssentials(job.house).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {workOrderRules(job.house, lang).length > 0 && (
                      <div className="mt-2" data-bot="clean-rules">
                        <p className="text-sm text-[var(--uml-muted)]">
                          {lang === 'es'
                            ? 'Al huésped se le pidió seguir esto. No es tu lista.'
                            : 'The guest was asked to follow this. It is not your checklist.'}
                        </p>
                        <ul className="mt-1 space-y-1 text-sm">
                          {workOrderRules(job.house, lang).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {workOrderNotes(job.house).length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm" data-bot="clean-notes">
                        {workOrderNotes(job.house).map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    )}
                    <p className="mt-3 text-sm text-[var(--uml-muted)]" data-bot="clean-leaving-note">
                      {lang === 'es'
                        ? 'Al huésped se le pidió esto antes de salir. No es tu lista.'
                        : 'The guest was asked to do this before leaving. It is not your checklist.'}
                    </p>
                    <ul className="mt-1 space-y-1 text-sm" data-bot="clean-leaving">
                      {workOrderLeaving(lang).map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ul>
                  </div>
                  <p className="text-sm text-[var(--uml-muted)]">
                    {done} of {job.steps.length}
                  </p>
                </div>
                <ul className="mt-4 space-y-2">
                  {job.steps.map((step) => {
                    const key = `${job.id}:${step.id}`;
                    const checked = stepDone(step.id, Boolean(checks[key]), photoCount);
                    return (
                      <li key={step.id}>
                        <label className="flex items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            data-bot={step.id === 'photos' ? 'clean-photo-check' : undefined}
                            checked={checked}
                            onChange={() => toggle(job.id, step.id)}
                          />
                          {cleanLabel(step.id, lang)}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-4" data-print-hide>
                  <label className="uml-nav inline-block cursor-pointer">
                    {lang === 'es' ? 'Agregar foto del cuarto' : 'Add a room photo'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="sr-only"
                      data-bot="clean-photo"
                      onChange={(event) => {
                        addPhoto(job.id, event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  {photoCount > 0 && (
                    <div className="mt-3 flex gap-2" data-bot="clean-photo-strip">
                      {photos[job.id]?.map((url) => (
                        <img key={url} src={url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="clean-photo-note">
                    {photoCount === 0
                      ? lang === 'es'
                        ? 'La línea de fotos sigue abierta hasta que haya una foto.'
                        : 'The photo line stays open until a room photo is attached.'
                      : lang === 'es'
                        ? `${photoCount} en esta pestaña. No se sube.`
                        : `${photoCount} in this tab. Not uploaded.`}
                  </p>
                </div>
                <label className="mt-4 block text-sm">
                  {lang === 'es' ? 'Qué hay que arreglar' : 'What needs a fix?'}
                  <textarea
                    className="mt-2 min-h-20 w-full rounded-2xl border border-[var(--uml-line)] bg-transparent px-4 py-3"
                    data-bot="clean-fix"
                    value={fixes.find((fix) => fix.id === job.id)?.note ?? ''}
                    placeholder={lang === 'es' ? 'Se queda en este navegador.' : 'Stays in this browser.'}
                    onChange={(event) => writeFix(job.id, job.houseName, job.checkout, event.target.value)}
                  />
                </label>
              </article>
            );
          })}
        </div>
      )}
      {tasks.length > 0 && (
        <div className="uml-panel rounded-3xl p-6" data-bot="clean-tasks" data-print-hide>
          <p className="uml-kicker">Open tasks</p>
          <ul className="mt-3 space-y-2 text-sm">
            {tasks.map((task) => (
              <li key={task.id}>
                {shortDate(task.dueDate)} · {task.propertyId} · {task.type}
                {task.notes ? ` · ${task.notes}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
