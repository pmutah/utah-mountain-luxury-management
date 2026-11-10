import { useEffect, useState } from 'react';
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
 * no dashboard. It shows the house, the day, the steps, how to get in, and — from the day before the
 * checkout through the turn day — the door code, because the cleaner is the person who has to get
 * inside. A guest name and a rate never appear.
 */
export function CleanLink({ token }: { token: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [lang, setLang] = useState<'en' | 'es'>('en');
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'error'>('loading');
  const [saving, setSaving] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Record<string, PhotoRow[]>>({});
  /** False when the site cannot store a photo, so the photo step must not demand one. */
  const [photosAvailable, setPhotosAvailable] = useState(true);
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
      const body = (await res.json()) as { photos?: PhotoRow[]; error?: string; storageConfigured?: boolean };
      if (res.ok && body.photos) {
        setPhotos((current) => ({ ...current, [keyFor(job)]: body.photos! }));
        /*
         * Whether this site can accept a photo at all. With storage off an upload always answers 503, so the photo
         * step must not demand one — otherwise it can never be ticked and no turnover reaches done.
         */
        setPhotosAvailable(body.storageConfigured !== false);
      } else setPhotoNote(body.error ?? 'Photos could not be read.');
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
        /*
         * A malformed or truncated cleaner link never reaches the route: the middleware's shape check sends it
         * to the host gate, which answers 401. Only a well-formed but unknown token reaches the route and gets
         * 404. Both mean the same thing to the cleaner — this link does not work — and reporting 401 as a
         * generic error sends them to the phone mid-shift instead of asking for a new link.
         */
        if (res.status === 404 || res.status === 401) {
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
    ? { title: 'Turnos de limpieza', steps: 'Qué hacer', arrive: 'Cómo entrar', door: 'Código de la puerta', rules: 'Reglas de la casa', empty: 'No hay turnos.' }
    : { title: 'Cleaning jobs', steps: 'What to do', arrive: 'How to get in', door: 'Door code', rules: 'House rules', empty: 'No turnovers.' };

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
              /*
               * 44px minimum, like the steps. A cleaner switches to Spanish on the same phone, often one-handed in a
               * driveway; a 26px pill is a miss.
               */
              className={`min-h-11 min-w-11 rounded-full border px-3 py-2 text-xs uppercase ${
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
                    {/*
                      The rows the **server** sent, not a second computation here.

                      This called the local `stepRows` helper with only `sameDay` and `lang` — no units — so a turn scoped to the
                      Garage Suite showed the whole-house bed count on the cleaner's phone, while `job.stepRows` (built with the
                      units server-side) said otherwise. Two calculations of one fact, and the one a person reads was the wrong
                      one. The same shape as the door code being sent and never drawn.
                    */}
                    {job.stepRows.map((step) => {
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
                            className={`flex w-full items-start gap-2 rounded-xl border px-3 py-3 text-left ${
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
                    {/*
                      Say it plainly when the site cannot store a photo. Otherwise a cleaner taps Add a photo, gets
                      "Photos are not turned on for this site yet", and has no idea whether their work counts — the
                      step is still on the list, so it reads as a job they are failing rather than a feature that is
                      off.
                    */}
                    {!photosAvailable && (
                      <p className="mt-1 text-sm text-[#5d564b]" data-bot="clean-link-photos-off">
                        {lang === 'es'
                          ? 'Las fotos no están activadas en este sitio. Marca el paso de fotos cuando hayas hecho las camas y la cocina; no se te pedirá una foto.'
                          : 'Photos are not turned on for this site yet. Tick the photo step once the rooms are ready — you will not be asked for an image.'}
                      </p>
                    )}
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
                  {/*
                    The door code, which the API has sent since 2026-11-10 and this page never drew — so the cleaner was told
                    "park in the driveway" and given no way in. It appears only inside the window the route enforces (the day
                    before the checkout through the turn day), and money never appears here.
                  */}
                  {job.door && job.door.length > 0 && (
                    <div className="mt-3 rounded-xl border border-[#8a6f2f]/35 bg-[#8a6f2f]/10 px-3 py-2" data-bot="clean-link-door">
                      {job.door.map((row) => (
                        <p key={row.label} className="text-sm text-[#3d382f]">
                          <span className="font-semibold">{t.door}:</span>{' '}
                          {job.door!.length > 1 ? `${row.label} ` : ''}
                          <span className="font-mono font-bold tracking-wider" data-door={row.code}>
                            {row.code}
                          </span>
                        </p>
                      ))}
                    </div>
                  )}
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
