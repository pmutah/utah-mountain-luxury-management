import { useEffect, useState } from 'react';
import { stepRows } from '../lib/clean-progress';
import type { CleanJobView } from '../lib/clean-link';

type Loaded = {
  jobs: CleanJobView[];
  progress: Array<{ house: string; checkout: string; done: string[] }>;
  note: string;
  lang: 'en' | 'es';
  storageReads: string;
};

type PhotoRow = { path: string; label: string; uploadedAt: string; url: string };

/**
 * The cleaner's page at `/clean/:token`. The link is the whole credential, so there is no login and
 * no dashboard. It shows the house, the day, the steps, and how to get in, and never a door code,
 * a guest name, or a rate.
 */
export function CleanLink({ token }: { token: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [lang, setLang] = useState<'en' | 'es'>('en');
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading');
  const [saving, setSaving] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, PhotoRow[]>>({});
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);

  /** A tick writes one step list for one turn. The page re-reads what came back. */
  async function toggle(job: CleanJobView, id: string) {
    if (!data) return;
    const key = `${job.house}:${job.checkout}`;
    const current = data.progress.find((row) => `${row.house}:${row.checkout}` === key)?.done ?? [];
    const next = current.includes(id) ? current.filter((step) => step !== id) : [...current, id];
    setSaving(key);
    try {
      const res = await fetch(`/api/clean/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ house: job.house, checkout: job.checkout, done: next }),
      });
      const body = (await res.json()) as { progress?: Array<{ house: string; checkout: string; done: string[] }> };
      if (res.ok && body.progress) setData({ ...data, progress: body.progress });
    } finally {
      setSaving(null);
    }
  }

  function doneFor(job: CleanJobView): string[] {
    return data?.progress.find((row) => row.house === job.house && row.checkout === job.checkout)?.done ?? [];
  }

  function keyFor(job: CleanJobView): string {
    return `${job.house}:${job.checkout}`;
  }

  /** Read the photos already on this turn. A failure leaves the list empty with a note. */
  async function loadPhotos(job: CleanJobView) {
    try {
      const res = await fetch(
        `/api/clean/${encodeURIComponent(token)}/photos?house=${encodeURIComponent(job.house)}&checkout=${encodeURIComponent(job.checkout)}`,
      );
      const body = (await res.json()) as { photos?: PhotoRow[]; error?: string };
      if (res.ok && body.photos) setPhotos((current) => ({ ...current, [keyFor(job)]: body.photos! }));
      else setPhotoNote(body.error ?? 'Photos could not be read.');
    } catch {
      setPhotoNote('Photos could not be read.');
    }
  }

  /** Attach one photo. The file is read here and sent as base64, so the route can measure it. */
  async function upload(job: CleanJobView, file: File) {
    setPhotoBusy(keyFor(job));
    setPhotoNote(null);
    try {
      const buffer = await file.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
      const res = await fetch(`/api/clean/${encodeURIComponent(token)}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          house: job.house,
          checkout: job.checkout,
          contentType: file.type,
          base64: btoa(binary),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) {
        setPhotoNote(body.error ?? 'That photo could not be saved.');
        return;
      }
      await loadPhotos(job);
    } catch {
      setPhotoNote('That photo could not be saved.');
    } finally {
      setPhotoBusy(null);
    }
  }

  async function removePhoto(job: CleanJobView, path: string) {
    setPhotoBusy(keyFor(job));
    try {
      await fetch(
        `/api/clean/${encodeURIComponent(token)}/photos?path=${encodeURIComponent(path)}`,
        { method: 'DELETE' },
      );
      await loadPhotos(job);
    } finally {
      setPhotoBusy(null);
    }
  }

  useEffect(() => {
    let cancel = false;
    void fetch(`/api/clean/${encodeURIComponent(token)}?lang=${lang}`)
      .then(async (res) => {
        const type = res.headers.get('content-type') ?? '';
        if (!type.includes('application/json')) throw new Error('not json');
        return { res, body: (await res.json()) as Loaded & { error?: string } };
      })
      .then(({ res, body }) => {
        if (cancel) return;
        if (res.status === 404) {
          setState('invalid');
          return;
        }
        if (!res.ok) {
          setState('error');
          return;
        }
        setData(body);
        setState('ready');
        // The photos already on each turn, so a cleaner coming back sees what is attached.
        for (const job of body.jobs) void loadPhotos(job);
      })
      .catch(() => {
        if (!cancel) setState('error');
      });
    return () => {
      cancel = true;
    };
  }, [token, lang]);

  const t = lang === 'es'
    ? { title: 'Turnos de limpieza', steps: 'Qué hacer', arrive: 'Cómo entrar', rules: 'Reglas de la casa', empty: 'No hay turnos.' }
    : { title: 'Cleaning jobs', steps: 'What to do', arrive: 'How to get in', rules: 'House rules', empty: 'No turnovers.' };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8" data-bot="clean-link" data-state={state}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#8a6f2f]">Utah Mountain Luxury</p>
      <div className="mt-1 flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl text-[#1d1a15]">{t.title}</h1>
        <div className="flex gap-1">
          {(['en', 'es'] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setLang(id)}
              data-bot={`clean-link-lang-${id}`}
              aria-pressed={lang === id}
              className={`rounded-full border px-3 py-1 text-xs uppercase ${
                lang === id ? 'border-[#8a6f2f] bg-[#8a6f2f] text-white' : 'border-[#cfc6b6] text-[#5d564b]'
              }`}
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      {state === 'loading' && (
        <p className="mt-6 text-sm text-[#5d564b]" data-bot="clean-link-loading">
          …
        </p>
      )}
      {state === 'invalid' && (
        <p className="mt-6 text-sm text-[#5d564b]" data-bot="clean-link-invalid">
          {lang === 'es'
            ? 'Este enlace no es válido. Pide uno nuevo. No se leyó nada.'
            : 'This clean link is not valid. Ask for a new one. Nothing was read.'}
        </p>
      )}
      {state === 'error' && (
        <p className="mt-6 text-sm text-[#5d564b]" data-bot="clean-link-error">
          {lang === 'es'
            ? 'No se pudo leer la lista. No está vacía. No se escribió nada.'
            : 'The list could not be read just now. It is not empty. Nothing was written.'}
        </p>
      )}

      {state === 'ready' && data && (
        <>
          <p className="mt-4 text-sm text-[#5d564b]" data-bot="clean-link-note">
            {data.note}
          </p>
          {photoNote && (
            <p className="mt-3 text-sm text-[#8b3a2f]" data-bot="clean-link-photo-note">
              {photoNote}
            </p>
          )}
          {data.jobs.length === 0 ? (
            <p className="mt-6 text-sm text-[#5d564b]" data-bot="clean-link-empty">
              {t.empty}
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {data.jobs.map((job) => (
                <li
                  key={`${job.house}-${job.checkout}`}
                  data-bot="clean-link-job"
                  data-house={job.house}
                  data-same-day={job.sameDay ? 'yes' : 'no'}
                  className="rounded-2xl border border-[#e2dbcd] bg-white p-5"
                >
                  <p className="font-display text-xl text-[#1d1a15]">
                    {job.houseName}
                  </p>
                  <p className="text-sm text-[#5d564b]">
                    {new Date(`${job.checkout}T12:00:00Z`).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                      timeZone: 'UTC',
                    })}
                  </p>
                  <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a6f2f]">{t.steps}</p>
                  <ul className="mt-1 space-y-1 text-sm text-[#3d382f]">
                    {stepRows(job.sameDay, lang).map((step) => {
                      const done = doneFor(job).includes(step.id);
                      return (
                        <li key={step.id}>
                          <button
                            type="button"
                            onClick={() => void toggle(job, step.id)}
                            disabled={saving === `${job.house}:${job.checkout}`}
                            data-bot="clean-link-step"
                            data-step={step.id}
                            data-done={done ? 'yes' : 'no'}
                            aria-pressed={done}
                            className={`flex w-full items-start gap-2 rounded-xl border px-3 py-2 text-left ${
                              done ? 'border-[#8a6f2f] bg-[#8a6f2f]/10 text-[#5d564b] line-through' : 'border-[#e2dbcd]'
                            }`}
                          >
                            <span aria-hidden="true">{done ? '✓' : '○'}</span>
                            <span>{step.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3" data-bot="clean-link-photos">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a6f2f]">
                      {lang === 'es' ? 'Fotos del cuarto' : 'Room photos'}
                    </p>
                    {(photos[keyFor(job)] ?? []).length > 0 && (
                      <ul className="mt-1 space-y-1 text-sm">
                        {(photos[keyFor(job)] ?? []).map((photo) => (
                          <li key={photo.path} className="flex items-center justify-between gap-2">
                            <a href={photo.url} target="_blank" rel="noreferrer" className="underline">
                              {photo.label}
                            </a>
                            <button
                              type="button"
                              disabled={photoBusy === keyFor(job)}
                              onClick={() => void removePhoto(job, photo.path)}
                              className="text-xs text-[#8a6f2f] underline disabled:opacity-50"
                            >
                              {lang === 'es' ? 'Quitar' : 'Remove'}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="mt-2 inline-block rounded-full border border-[#cfc6b6] px-4 py-2 text-sm">
                      {photoBusy === keyFor(job)
                        ? (lang === 'es' ? 'Subiendo…' : 'Uploading…')
                        : (lang === 'es' ? 'Agregar una foto' : 'Add a photo')}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        capture="environment"
                        data-bot="clean-link-photo"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void upload(job, file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                  <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a6f2f]">{t.arrive}</p>
                  <p className="mt-1 text-sm text-[#3d382f]">{job.arrive}</p>
                  {job.rules.length > 0 && (
                    <>
                      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8a6f2f]">{t.rules}</p>
                      <ul className="mt-1 space-y-1 text-sm text-[#3d382f]">
                        {job.rules.map((rule) => (
                          <li key={rule}>{rule}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
