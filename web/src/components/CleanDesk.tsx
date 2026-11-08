import { useEffect, useMemo, useRef, useState } from 'react';
import type { Reservation } from '../lib/api';
import { cleanJobs, cleanLabel, jobDoneCount, stepDone, workOrderEssentials, workOrderLeaving, workOrderMap, workOrderNotes, workOrderPlace, workOrderRules, cleanQuietLine, cleanSafetyLine, workOrderNext, workOrderParty, workOrderArrival, workOrderDeparture, workOrderCheckoutParty, workOrderLaterLeave, workOrderEarly, workOrderPrep, workOrderWhen, workOrderEvent, type CleanLang } from '../lib/clean';
import type { CleanJob } from '../lib/clean';
import { jobLeaveAt2, stepText, turnHours } from '../lib/turn-clock';
import { canyonDesk, canyonFromTurns, turnLoad } from '../lib/turn-load';
import { CleanLinkPanel } from './CleanLinkPanel';
import { openSteps, turnState, turnStateLine, type CleanProgress, type TurnState } from '../lib/clean-progress';
import { api } from '../lib/api';
import { earlyStayOpen } from '../lib/house-stay';
import { loadBookedNights, loadQuoteCalendar, type QuoteTurn } from '../lib/booked-nights';
import { checkoutNightIsFree } from '../lib/journey';
import type { HouseId } from '../lib/market/types';
import { usePreferenceTimes } from '../hooks/useArrivalWindows';
import { loadCleanFixes, saveCleanFixes, upsertCleanFix, type CleanFix } from '../lib/clean-notes';
import { HouseFixPad } from './CleanHouseNotes';
import { cleanJobsEmptyLine, cleanTurnsLine, cleanTurnsVisible, photoGuideLine } from '../lib/clean-ready';
import { cleanRouteForTurns } from '../lib/clean-route';
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
  // Ticks the cleaner made on their own link. Read from the server so the desk and the phone agree.
  const [cleanProgress, setCleanProgress] = useState<CleanProgress[] | null>(null);
  /**
   * Whether this site can store a room photo. False means an upload always answers 503, so the photo step must not
   * demand one — otherwise it can never be ticked and no turnover reaches done.
   */
  const [photosAvailable, setPhotosAvailable] = useState(true);
  useEffect(() => {
    let cancel = false;
    void api
      .getCleanProgress()
      .then((result) => {
        if (cancel) return;
        setCleanProgress(result.storageReads === 'paused' ? null : result.progress);
        setPhotosAvailable(result.photosAvailable !== false);
      })
      .catch(() => {
        if (!cancel) setCleanProgress(null);
      });
    return () => {
      cancel = true;
    };
  }, []);
  const progressRows = cleanProgress ?? [];
  // The cleaner's own room photos. Without these the photo step would only count photos attached in
  // this browser tab, so a cleaner who uploaded from their link would still read as unfinished.
  useEffect(() => {
    let cancel = false;
    void api
      .getCleanPhotoTurns()
      .then((result) => {
        if (cancel || result.storageReads === 'paused') return;
        setUploaded(result.turns);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);
  function uploadedFor(job: CleanJob): Array<{ path: string; label: string; url: string }> {
    return uploaded[`${job.house}:${job.checkout}`] ?? [];
  }
  function hostTurnState(job: CleanJob): TurnState {
    return turnState(job.house, job.checkout, job.priority, progressRows);
  }
  function hostProgressLine(job: CleanJob): string {
    if (cleanProgress === null) return 'The cleaner ticks could not be read. This line is not a zero.';
    return turnStateLine(job.house, job.checkout, job.priority, progressRows);
  }
  /**
   * How many of this turn's steps the **cleaner** has ticked, from the server row.
   *
   * Uses `openSteps` from the shared progress module rather than re-deriving it, so the desk's count and the line
   * above it cannot disagree about the same turn again. A photo the cleaner uploaded counts as the photo step even if
   * their tick for it has not landed yet, because the photo is itself evidence the step was done.
   */
  function serverDoneCount(job: CleanJob, progress: readonly CleanProgress[], photoCount: number): number {
    const total = job.steps.length;
    const open = openSteps(job.house, job.checkout, job.priority, progress);
    let done = Math.max(0, total - open);
    const row = progress.find((item) => item.house === job.house && item.checkout === job.checkout);
    if (photoCount > 0 && !(row?.done ?? []).includes('photos')) done = Math.min(total, done + 1);
    return done;
  }
  const preferenceTimes = usePreferenceTimes();
  const [taken, setTaken] = useState<Record<HouseId, string[]> | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecks);
  const [tasks, setTasks] = useState<OpenTask[]>([]);
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
  const [photos, setPhotos] = useState<Record<string, string[]>>({});
  /** Room photos the cleaner uploaded from their own link, keyed by turn. */
  const [uploaded, setUploaded] = useState<Record<string, Array<{ path: string; label: string; url: string }>>>({});
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

  /**
   * Tick a step on the host's own desk.
   *
   * This wrote to `sessionStorage`, so it was a box that changed nothing the card could see: the count and the line
   * beside it both read the server. Measured on production — a click left `0 of 7` at `0 of 7`.
   *
   * It now writes to the same store the cleaner writes to, so the desk and the phone hold one truth. The local map
   * stays as the optimistic value for the instant before the round trip lands, and is replaced by the server row when
   * it does. If the write fails, the tick is reverted rather than left looking saved.
   */
  function toggle(job: CleanJob, stepId: string) {
    if (stepId === 'photos' && (photos[job.id]?.length ?? 0) === 0) return;
    const key = `${job.id}:${stepId}`;
    const turningOn = !checks[key];
    setChecks((current) => {
      const next = { ...current, [key]: turningOn };
      sessionStorage.setItem(CHECKS_KEY, JSON.stringify(next));
      return next;
    });

    const existing = progressRows.find((row) => row.house === job.house && row.checkout === job.checkout);
    const current = new Set(existing?.done ?? []);
    if (turningOn) current.add(stepId);
    else current.delete(stepId);

    void api
      .saveCleanProgress({ house: job.house, checkout: job.checkout, done: [...current] })
      .then((result) => {
        if (result?.progress) setCleanProgress(result.progress);
      })
      .catch(() => {
        // The tick did not reach the server, so it must not keep looking done on this screen.
        setChecks((now) => {
          const reverted = { ...now, [key]: !turningOn };
          sessionStorage.setItem(CHECKS_KEY, JSON.stringify(reverted));
          return reverted;
        });
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
        {cleanTurnsVisible(turns, jobs.length) && (
          <p className="mt-4 text-sm" data-bot="clean-turns">
            {cleanTurnsLine(turns ?? [], lang)}
          </p>
        )}
        <p className="mt-4 text-sm" data-bot="clean-route">
          {cleanRouteForTurns(
            turns,
            jobs.length > 0 ? jobs.map((job) => job.house) : ['ranch', 'lindon', 'river'],
            lang,
          )}
        </p>
        {(turns
          ? canyonFromTurns(turns, lang)
          : canyonDesk(
              jobs.map((job) => ({
                house: job.house,
                houseName: job.houseName,
                checkout: job.checkout,
                clock: { sameDay: job.priority, leaveAt2: false, arriveAt1: false },
              })),
              lang,
            )
        ).map((row) => (
          <p key={row.date || 'none'} className="mt-2 text-sm" data-bot="clean-canyon" data-date={row.date || 'none'}>
            {row.line}
          </p>
        ))}
        <div className="mt-4">
          <HouseFixPad lang={lang} houses={['river', 'ranch', 'lindon']} />
        </div>
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
      <CleanLinkPanel />
      {cleanJobsEmptyLine(jobs.length, turns, lang) ? (
        <p className="uml-panel rounded-3xl p-6 text-sm text-[var(--uml-muted)]" data-bot="clean-empty">
          {cleanJobsEmptyLine(jobs.length, turns, lang)}
        </p>
      ) : jobs.length === 0 ? null : (
        <div className="space-y-4">
          {turnLoad(
            jobs.map((job) => ({
              house: job.house,
              houseName: job.houseName,
              checkout: job.checkout,
              clock: {
                sameDay: job.priority,
                leaveAt2: jobLeaveAt2(preferenceTimes?.departure[job.checkoutStayId], job.leaveAt2),
                arriveAt1: job.arriveAt1,
              },
            })),
            lang,
          ).map((row) => (
            <p key={row.date} className="uml-panel rounded-3xl p-6 text-sm" data-bot="clean-load" data-date={row.date}>
              {row.line}
            </p>
          ))}
          {jobs.map((job) => {
            // A cleaner's uploaded photo counts the same as one attached in this browser.
            const photoCount = Math.max(photos[job.id]?.length ?? 0, uploadedFor(job).length);
            /*
             * The count has to come from the same store as the line above it.
             *
             * The card read "The cleaner marked this turn done." directly above "0 of 7", because the line above came
             * from the server (what the cleaner actually ticked) while this count came from `checks` — this browser's
             * own sessionStorage. Measured on production with a fully-ticked turn: the desk said 0 of 7.
             *
             * A cleaner works on their phone; the host's browser has none of their ticks, so this count was always
             * zero for real work. It now counts the server row, and falls back to the local checks only when the
             * server read FAILED — in which case the line above already says the ticks could not be read.
             *
             * A step the host has just clicked counts at once, because the box beside it already shows ticked and the
             * number must not lag the box it sits above.
             */
            const done =
              cleanProgress === null
                ? jobDoneCount(job.steps, checks, job.id, photoCount, photosAvailable)
                : Math.max(serverDoneCount(job, progressRows, photoCount), jobDoneCount(job.steps, checks, job.id, photoCount, photosAvailable));
            const clock = turnHours(
              {
                sameDay: job.priority,
                leaveAt2: jobLeaveAt2(preferenceTimes?.departure[job.checkoutStayId], job.leaveAt2),
                arriveAt1: job.arriveAt1,
              },
              lang,
            );
            return (
              <article key={job.id} className="uml-panel rounded-3xl p-6" data-bot="clean-job">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="uml-kicker">{job.priority ? (lang === 'es' ? 'Mismo día' : 'Same-day') : job.house}</p>
                    <h3 className="font-display text-4xl">{job.houseName}</h3>
                    <p className="mt-1 text-sm text-[var(--uml-muted)]">
                      {shortDate(job.checkout)} · {gapLabel(job.gapNights, lang)}
                    </p>
                    <p className="mt-1 text-sm" data-bot="clean-quiet">
                      {cleanQuietLine(job.house, lang)}
                    </p>
                    <p className="mt-1 text-sm" data-bot="clean-window">
                      {workOrderWhen(job.house, job.priority, lang)}
                    </p>
                    <p className="mt-1 text-sm" data-bot="clean-hours">
                      {clock.text}
                    </p>
                    <p className="mt-1 text-sm" data-bot="clean-progress" data-state={hostTurnState(job)}>
                      {hostProgressLine(job)}
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
                    {workOrderEvent(job.nextCheckIn, job.nextCheckOut, lang) && (
                      <p className="mt-1 text-sm" data-bot="clean-event">
                        {workOrderEvent(job.nextCheckIn, job.nextCheckOut, lang)}
                      </p>
                    )}
                    {taken && job.nextCheckIn && (
                      <p className="mt-1 text-sm" data-bot="clean-early">
                        {workOrderEarly(earlyStayOpen(job.nextCheckIn, taken[job.house] ?? [], asOf), lang)}
                      </p>
                    )}
                    {job.nextCheckIn && workOrderPrep(job.house, job.nextCheckIn, asOf, lang) && (
                      <p className="mt-1 text-sm" data-bot="clean-prep">
                        {workOrderPrep(job.house, job.nextCheckIn, asOf, lang)}
                      </p>
                    )}
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
                    {workOrderEssentials(job.house, lang).length > 0 && (
                      <div className="mt-2" data-bot="clean-essentials">
                        <p className="text-sm text-[var(--uml-muted)]">
                          {lang === 'es' ? 'Antes de ir. Es para el camino, no es tu lista.' : 'Before you go. This is for the drive, not your checklist.'}
                        </p>
                        <ul className="mt-1 space-y-1 text-sm">
                          {workOrderEssentials(job.house, lang).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <p className="mt-2 text-sm" data-bot="clean-safety">
                      {cleanSafetyLine(lang)}
                    </p>
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
                    {workOrderNotes(job.house, lang).length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm" data-bot="clean-notes">
                        {workOrderNotes(job.house, lang).map((line) => (
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
                      {workOrderLeaving(job.house, lang).map((step) => (
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
                    /*
                     * The box reads the **server** row, with the local map as the optimistic value for the instant
                     * before a write lands. Reading only local state meant a host's own tick vanished on reload,
                     * and reading only the server would make the box feel unresponsive to the click.
                     */
                    const onServer =
                      cleanProgress === null
                        ? false
                        : (progressRows.find((row) => row.house === job.house && row.checkout === job.checkout)?.done ?? []).includes(
                            step.id,
                          );
                    const checked = stepDone(step.id, onServer || Boolean(checks[key]), photoCount, photosAvailable);
                    return (
                      <li key={step.id}>
                        <label className="flex items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            data-bot={step.id === 'photos' ? 'clean-photo-check' : undefined}
                            checked={checked}
                            onChange={() => toggle(job, step.id)}
                          />
                          {stepText(step.id, cleanLabel(step.id, lang), clock.text)}
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
                  {(photoCount > 0 || uploadedFor(job).length > 0) && (
                    <div className="mt-3 flex flex-wrap gap-2" data-bot="clean-photo-strip">
                      {uploadedFor(job).map((photo) => (
                        <a key={photo.path} href={photo.url} target="_blank" rel="noreferrer" data-bot="clean-photo-uploaded">
                          <img src={photo.url} alt={photo.label} className="h-16 w-16 rounded-xl object-cover" />
                        </a>
                      ))}
                      {photos[job.id]?.map((url) => (
                        <img key={url} src={url} alt="" className="h-16 w-16 rounded-xl object-cover" />
                      ))}
                    </div>
                  )}
                  {photoGuideLine(job.house, lang) && (
                    <p className="mt-2 text-sm" data-bot="clean-photo-guide" data-house={job.house}>
                      {photoGuideLine(job.house, lang)}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-[var(--uml-muted)]" data-bot="clean-photo-note">
                    {uploadedFor(job).length > 0
                      ? lang === 'es'
                        ? `${uploadedFor(job).length} del enlace del limpiador.`
                        : `${uploadedFor(job).length} from the cleaner's link.`
                      : photoCount === 0
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


