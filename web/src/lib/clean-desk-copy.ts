import type { CleanLang } from './clean';

/**
 * What the clean desk says about where its own data goes.
 *
 * This paragraph was wrong in two of three sentences, and both were the kind of wrong that costs a host trust in the
 * whole screen:
 *
 *   "Checks stay on this browser."                    — they had been moved to the server.
 *   "A room photo ... is not uploaded."               — true of the host's own file picker, false of the cleaner's
 *                                                      link, which uploads to /api/clean/:token/photos.
 *   "A fix note stays in this browser and does not create a task." — still true.
 *
 * So the note is built here, one sentence per fact, and a test holds it to what the code actually does. A single blob of
 * prose is what let the first two sentences drift.
 */
export function cleanDeskNote(lang: CleanLang): string {
  if (lang === 'es') {
    return [
      'Las salidas salen de las reservas que ya están en el calendario.',
      // Ticks are shared now, so the desk and the cleaner's phone read one row.
      'Las marcas se guardan en el servidor, así que tu escritorio y el enlace del limpiador ven lo mismo.',
      // The host's file picker is local; the cleaner's link uploads.
      'Una foto que adjuntas aquí se queda en esta pestaña. Las que sube el limpiador desde su enlace sí se guardan.',
      'Una nota de arreglo se queda en este navegador y no crea una tarea.',
      'No cambian una reserva ni un gasto.',
    ].join(' ');
  }
  return [
    'Turnovers come from the bookings already on the calendar.',
    // Ticks are shared now, so the desk and the cleaner's phone read one row.
    'Checks are saved to the server, so this desk and the cleaner\'s link see the same ticks.',
    // The host's file picker is local; the cleaner's link uploads.
    'A photo you attach here stays in this tab. Photos the cleaner uploads from their link are saved.',
    'A fix note stays in this browser and does not create a task.',
    'They do not change a booking or an expense.',
  ].join(' ');
}
