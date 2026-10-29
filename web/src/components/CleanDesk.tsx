import { useEffect, useMemo, useState } from 'react';
import type { Reservation } from '../lib/api';
import { cleanJobs } from '../lib/clean';
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

function gapLabel(gap: number | null) {
  if (gap === null) return 'Nothing booked after this checkout.';
  if (gap === 0) return 'Same-day clean. Next guest arrives today.';
  return `${gap} night${gap === 1 ? '' : 's'} before the next arrival.`;
}

export function CleanDesk({ reservations }: { reservations: Reservation[] }) {
  const asOf = currentDayIso();
  const jobs = useMemo(() => cleanJobs(reservations, asOf), [reservations, asOf]);
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecks);
  const [tasks, setTasks] = useState<OpenTask[]>([]);

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

  function toggle(jobId: string, stepId: string) {
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
          Turnovers come from the bookings already on the calendar. Checks stay on this browser. They do not change a booking or an expense.
        </p>
      </div>
      {jobs.length === 0 ? (
        <p className="uml-panel rounded-3xl p-6 text-sm text-[var(--uml-muted)]">No checkouts in the next two weeks.</p>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => {
            const done = job.steps.filter((step) => checks[`${job.id}:${step.id}`]).length;
            return (
              <article key={job.id} className="uml-panel rounded-3xl p-6" data-bot="clean-job">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="uml-kicker">{job.priority ? 'Same-day' : job.house}</p>
                    <h3 className="font-display text-4xl">{job.houseName}</h3>
                    <p className="mt-1 text-sm text-[var(--uml-muted)]">
                      {shortDate(job.checkout)} · {gapLabel(job.gapNights)}
                    </p>
                  </div>
                  <p className="text-sm text-[var(--uml-muted)]">
                    {done} of {job.steps.length}
                  </p>
                </div>
                <ul className="mt-4 space-y-2">
                  {job.steps.map((step) => {
                    const key = `${job.id}:${step.id}`;
                    return (
                      <li key={step.id}>
                        <label className="flex items-center gap-3 text-sm">
                          <input
                            type="checkbox"
                            checked={Boolean(checks[key])}
                            onChange={() => toggle(job.id, step.id)}
                          />
                          {step.label}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      )}
      {tasks.length > 0 && (
        <div className="uml-panel rounded-3xl p-6" data-bot="clean-tasks">
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
