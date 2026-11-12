/**
 * The morning run, called by the worker cron.
 *
 * The plan's last gap: the seven-day shadow clock advanced only when a host opened a page, so a week of not looking at the dashboard
 * was a week of not qualifying for the rate switch. And nothing told the host anything unless he went looking.
 *
 * This route does the four things a morning actually needs:
 *
 *   1. **Records today's shadow day** from the live calendar, so the clock advances itself.
 *   2. **Builds the morning list** — turnovers, requests waiting, nights at risk — from the same stores the desk reads.
 *   3. **Reads the snow**, and includes the plow line when the switch says to.
 *   4. **Sends one text** to the host, at most once per date, and only when the `digest` switch is on.
 *
 * What it will not do, on purpose:
 *
 *   - **Text a guest.** The recipient is `HOST_DIGEST_TO`, and there is no code path that reads a guest address.
 *   - **Send twice.** `digestSent:YYYY-MM-DD` is written before the send is attempted, so a retry from the worker cannot deliver the
 *     same morning twice. If the send then fails, the response says so and the host is not told it went.
 *   - **Send when it cannot read the books.** A digest built from an unread calendar is not a digest; the route refuses and says so
 *     rather than texting "0 nights at risk".
 *   - **Record a shadow day from invented comps.** The boards are loaded for real; a house with no measured nights records its own
 *     truth and the gate stays where it is.
 */

import { hostDenied, hostOnly } from '../../_lib/auth';
import { corsJson } from '../../_lib/data';
import { kvGet, kvPut, storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';
import { failSoft } from '../../_lib/platform/http';
import { readSwitches } from '../../_lib/platform/switches';
import { audit, auditActorFor } from '../../_lib/platform/audit-store';
import { cronAuthorized } from '../../_lib/roles';
import { sendTwilioSms, isTwilioConfigured } from '../../_lib/twilio-sms';
import { getAllReservations } from '../../_lib/reservations-store';
import { loadCalendarBlocks } from '../../_lib/calendar-store';
import { loadLiveNights, loadApprovedRates } from '../../_lib/pricing-store';
import { buildMarketBoard } from '../../../src/lib/market/board';
import { readConditions } from '../../_lib/platform/weather';
import { addDays, denverToday } from '../../../src/lib/market/dates';import { nightsAtRisk, nightsAtRiskLine } from '../../../src/lib/platform/nights-at-risk';
import { mergeSavedShadowDay, shadowClockFromSaved, type SavedShadowDay } from '../../../src/lib/market/shadow-log';
import type { HouseId } from '../../../src/lib/market/types';

const SHADOW_KEY = 'shadowDays';
const DIGEST_KEY = 'digestSent';
const HOUSES: HouseId[] = ['river', 'ranch', 'lindon'];

type Env = SettingsEnv & {
  DASHBOARD_PASSWORD?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_SMS_FROM?: string;
  UML_TWILIO_SMS_FROM?: string;
  HOST_DIGEST_TO?: string;
  CRON_SECRET?: string;
};

/**
 * `POST /api/platform/daily`.
 *
 * Authorised two ways: a host session (so a person can run it and read the answer), or `Authorization: Bearer CRON_SECRET` for the
 * worker. A wrong or absent bearer with no session is refused 401 before this body runs.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const cron = cronAuthorized(request, env);
  if (!cron && !hostOnly(request, env)) return hostDenied(request, env);
  try {
    const today = denverToday();
    const switches = await readSwitches(env);
    /*
     * A switch store that cannot be read means "do not send", which is the safe reading for a route whose main act is a text. The
     * response says which happened so a host is never told the store was fine.
     */
    const switchesKnown = switches.ok;

    // 1. The books. A failure here refuses the whole run: a digest from an unread calendar is not a digest.
    let stays;
    let blocks;
    try {
      stays = await getAllReservations(env);
      blocks = await loadCalendarBlocks(env);
    } catch (err) {
      const message = storageReadPaused(err)
        ? 'Saved bookings could not be read, so no morning list was built and nothing was sent.'
        : err instanceof Error
          ? err.message
          : 'The calendar failed';
      return corsJson(request, { ok: false, sent: false, reason: message }, 503);
    }

    // 2. The calendar per house, from the same functions the desk uses.
    const closed: Partial<Record<HouseId, string[]>> = {};
    for (const house of HOUSES) {
      closed[house] = blocks.filter((block) => block.propertyId === house).flatMap((block) => nightsBetween(block.start, block.end));
    }

    // 3. The morning list: turnovers, and the nights nothing can sell.
    const arrivals = stays.filter((stay) => stay.checkIn === today && stay.status !== 'cancelled' && stay.status !== 'blocked');
    const departures = stays.filter((stay) => stay.checkOut === today && stay.status !== 'cancelled' && stay.status !== 'blocked');
    const stayLines = [
      departures.length > 0 ? `${departures.length} leaving today` : '',
      arrivals.length > 0 ? `${arrivals.length} arriving today` : '',
    ].filter(Boolean);
    /*
     * `nightsAtRisk` is the same function the desk renders, with the booking engine's own `bookableNights` behind it, so the text
     * and the page cannot disagree. `pace: 'unknown'` is the honest default: this run has not measured a year's pace.
     */
    const risk = nightsAtRisk({ reservations: stays, asOf: today, closed, pace: 'unknown' });
    const riskLine = nightsAtRiskLine(risk, 14);
    const riskyNights = risk.reduce((sum, row) => sum + row.unsellable, 0);

    // 4. The snow, when the switch says to include it.
    let snowLine = '';
    if (switchesKnown && switches.state.snow) {
      const conditions = await readConditions(fetch);
      snowLine = conditions.ok
        ? conditions.snow
          ? `${conditions.snow.inches48} in at Sundance. ${conditions.plow.dispatch ? 'Plow recommended.' : 'No plow.'}`
          : 'No snow figure came back.'
        : 'Snow could not be read.';
    }

    // 5. The shadow day, when the switch says to record it.
    let shadowNote = '';
    if (switchesKnown && switches.state.shadowDay) {
      const saved = await readShadowDays(env);
      const clock = shadowClockFromSaved(saved, today);
      if (clock.dates.includes(today)) {
        shadowNote = `Shadow day ${clock.days} of 7 already recorded.`;
      } else {
        /*
         * The shadow day must be built from a **real** market, or it does not count.
         *
         * The first version of this run composed its own sentence and saved it. That would have been a worse bug than the one it replaced:
         * `daySawRealComps` only rejects a digest that *says* "sample comps", and a hand-written line says nothing about comps at all — so it
         * passed the check while having read no comp. Seven mornings of that would have unlocked the rate switch on a market nobody measured,
         * which is exactly what the gate exists to prevent.
         *
         * So the board is read for real, and a board with no measured nights refuses to record rather than counting as a day.
         */
        const board = await readMarketBoard(env);
        if (!board.ok) {
          shadowNote = `The shadow day was not recorded: ${board.reason}`;
        } else {
          /*
           * The digest names what was measured and what was not. A single median across three houses would hide Lindon's five nights behind
           * River's twenty-three, which is the kind of blended figure that reads as a market when it is really one house.
           */
          const measuredLine = board.measured
            .map((row) => `${row.house} ${row.nights} nights${row.median === null ? '' : ` at a $${row.median} median`}`)
            .join(', ');
          const thinLine =
            board.thin.length > 0
              ? `${board.thin.map((row) => `${row.house} ${row.nights}`).join(', ')} measured nights is too thin to set a band.`
              : '';
          const digest = [
            `Morning run for ${today}.`,
            `${arrivals.length} arriving, ${departures.length} leaving, ${riskyNights} nights no stay can sell inside 14 days.`,
            `Market measured: ${measuredLine}.`,
            thinLine,
            snowLine,
            'Nothing sent to Hospitable.',
          ]
            .filter(Boolean)
            .join(' ');
          try {
            const merged = mergeSavedShadowDay(saved, { date: today, digest, savedAt: new Date().toISOString() });
            /*
             * The store refuses a digest that cannot count. That refusal is the answer, not a failure to paper over: a day saved but
             * ineligible would read as progress while the clock stayed still.
             */
            const after = shadowClockFromSaved(merged, today);
            if (!after.dates.includes(today)) {
              shadowNote = `The shadow day was not counted: the market it read carries no measured comp asks.`;
            } else {
              await kvPut(env, SHADOW_KEY, merged);
              shadowNote = `Shadow day ${after.days} of 7 recorded.`;
            }
          } catch (err) {
            shadowNote = storageReadPaused(err)
              ? 'The shadow day could not be written.'
              : 'The shadow day was not recorded.';
          }
        }
      }
    }

    // 6. The text, once per date.
    const body = [
      `Utah Mountain Luxury, ${today}.`,
      stayLines.length > 0 ? `${stayLines.join(', ')}.` : 'No arrival or departure today.',
      riskLine,
      snowLine,
      shadowNote,
    ]
      .filter(Boolean)
      .join(' ');

    const to = (env.HOST_DIGEST_TO ?? '').trim();
    const wantSend = switchesKnown && switches.state.digest;
    let sent = false;
    let sendNote = '';

    if (!wantSend) {
      sendNote = switchesKnown
        ? 'The digest switch is off, so nothing was sent.'
        : `The switches could not be read (${switches.ok ? '' : switches.reason}), so nothing was sent.`;
    } else if (!to) {
      sendNote = 'No HOST_DIGEST_TO is set, so there is nobody to text.';
    } else if (!isTwilioConfigured(env)) {
      sendNote = 'Twilio is not configured on this deployment, so no text was sent.';
    } else if (await alreadySent(env, today)) {
      sendNote = 'A digest already went out today. Nothing was sent twice.';
    } else {
      /*
       * Claim the day **before** sending. A crash between the claim and the send loses one morning's text; the other order
       * delivers it twice, which is the failure that makes a host stop reading them.
       */
      const claimed = await claimDay(env, today);
      if (!claimed) {
        sendNote = 'The send could not be claimed for today, so nothing was sent.';
      } else {
        const result = await sendTwilioSms(env, to, body);
        sent = !result.error;
        sendNote = result.error ?? 'Sent.';
      }
    }

    const logged = await audit(env, {
      actor: auditActorFor(request, env),
      action: 'platform.daily',
      target: today,
      note: sent ? 'The morning text was sent.' : `No text was sent: ${sendNote}`.slice(0, 190),
    });

    return corsJson(
      request,
      {
        ok: true,
        date: today,
        sent,
        sendNote,
        body,
        morning: {
          arrivals: arrivals.length,
          departures: departures.length,
          nightsAtRisk: riskyNights,
        },
        switches: switchesKnown ? switches.state : null,
        shadow: shadowNote || null,
        books: 'read',
        ...(logged.ok ? {} : { auditFailed: logged.reason }),
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    return failSoft(request, err, 'The morning run');
  }
};

/**
 * The market as it actually stands, per house, for the shadow day to record.
 *
 * This builds the board **in process**, from the same functions `/api/market/overview` uses, rather than fetching that route over HTTP. My
 * first version did fetch it, and the run answered "the river board answered 401": the overview route is host-gated, and a cron call carries no
 * session, so it could never have read its own market. A cron asking the app to authorise itself is the wrong shape.
 *
 * **Per house, not a single floor.** My first version took the minimum across the three, so production's real state — River 23 measured nights,
 * Ranch 18, Lindon 5 — reported 5 and would have refused the whole day if Lindon had one fewer. One thin house is not a reason to say nothing
 * about the two that are measured. A day records the houses that carry a market and names the ones that do not, so the digest cannot imply a
 * figure it did not measure.
 *
 * A house needs at least `MIN_MEASURED_NIGHTS` nights with a saved comp ask inside the next 30 to count, which is the same floor the market
 * page uses before it will claim a median.
 */
const MIN_MEASURED_NIGHTS = 5;

type MarketRead =
  | {
      ok: true;
      /** Houses with enough measured nights to set a band. */
      measured: Array<{ house: HouseId; nights: number; median: number | null }>;
      /** Houses that do not carry a market yet. */
      thin: Array<{ house: HouseId; nights: number }>;
    }
  | { ok: false; reason: string };

async function readMarketBoard(env: Env): Promise<MarketRead> {
  try {
    const from = denverToday();
    const days = 90;
    const approved = (await loadApprovedRates(env)).map((row) => ({ house: row.house, date: row.date, guest: row.guest }));
    const measured: Array<{ house: HouseId; nights: number; median: number | null }> = [];
    const thin: Array<{ house: HouseId; nights: number }> = [];
    for (const house of HOUSES) {
      const live = await loadLiveNights(env, house, from, days);
      const board = buildMarketBoard(
        house,
        from,
        days,
        undefined,
        live ?? null,
        approved.filter((row) => row.house === house).map((row) => ({ date: row.date, guest: row.guest })),
      );
      const nights = board.summary.measuredNights;
      if (nights >= MIN_MEASURED_NIGHTS) {
        measured.push({ house, nights, median: board.summary.liveMedianAsk });
      } else {
        thin.push({ house, nights });
      }
    }
    if (measured.length === 0) {
      return {
        ok: false,
        reason: `no house has ${MIN_MEASURED_NIGHTS} of the next 30 nights with a saved comp ask, so no shadow day can be recorded`,
      };
    }
    return { ok: true, measured, thin };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : 'the market could not be read' };
  }
}

async function readShadowDays(env: Env): Promise<SavedShadowDay[]> {  try {
    const saved = await kvGet<unknown>(env, SHADOW_KEY, []);
    if (!Array.isArray(saved)) return [];
    return saved.filter(
      (day): day is SavedShadowDay =>
        Boolean(day) && typeof (day as SavedShadowDay).date === 'string' && typeof (day as SavedShadowDay).digest === 'string',
    );
  } catch {
    return [];
  }
}

/** Whether a text already went out for this date. A read failure is treated as "already sent", so a retry does not double-text. */
async function alreadySent(env: Env, date: string): Promise<boolean> {
  try {
    const saved = await kvGet<string[]>(env, DIGEST_KEY, []);
    return Array.isArray(saved) && saved.includes(date);
  } catch {
    return true;
  }
}

/** Write the date before sending. Returns false when the claim could not be recorded. */
async function claimDay(env: Env, date: string): Promise<boolean> {
  try {
    const saved = await kvGet<string[]>(env, DIGEST_KEY, []);
    const list = (Array.isArray(saved) ? saved : []).filter((row) => typeof row === 'string');
    // Keep a rolling month of dates: this key is a guard, not a history.
    const keep = [...new Set([...list, date])].slice(-31);
    await kvPut(env, DIGEST_KEY, keep);
    return true;
  } catch {
    return false;
  }
}

/** Every night from `checkIn` up to but not including `checkOut`. */
function nightsBetween(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) return out;
  let cursor = checkIn;
  let guard = 0;
  while (cursor < checkOut && guard < 400) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return out;
}

/** A host running it by hand, to see the text without waiting for the cron. Refused for anyone else. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!cronAuthorized(request, env) && !hostOnly(request, env)) return hostDenied(request, env);
  try {
    const switches = await readSwitches(env);
    return corsJson(
      request,
      {
        ok: true,
        switches: switches.ok ? switches.state : null,
        ...(switches.ok ? {} : { reason: switches.reason }),
        twilio: isTwilioConfigured(env),
        recipientSet: Boolean((env.HOST_DIGEST_TO ?? '').trim()),
        note: 'POST runs it. This is a read of what it would use, and it sends nothing.',
        sends: false,
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    return failSoft(request, err, 'The morning run');
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
