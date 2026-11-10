/**
 * The rate-publishing sender, and the switch that keeps it off.
 *
 * **The owner asked for this to exist with a host-controlled switch, left OFF** (2026-11-10): "Build the publishing ability
 * (the sender) with a host-controlled on/off switch, so approved prices can be pushed to Airbnb/Vrbo when the host decides —
 * but leave it OFF. Nothing publishes until the host flips it on."
 *
 * Two things make that safe rather than merely present:
 *
 *   1. **Off is the default, and off is not the absence of a setting.** `HOSPITABLE_RATE_PUSH` must read exactly `on` and
 *      `HOSPITABLE_PRICE_UNIT` must name the unit; anything else — unset, `off`, a typo — is off. A switch that turns on by
 *      accident is worse than no switch.
 *   2. **The doctrine conflict is stated, not hidden.** `pricing-doctrine.ts` and the owner's vault note both say a rate must
 *      not be set in Hospitable: "Do not change the rate and do not create the promotion in Hospitable. Hospitable stays the
 *      calendar and the inbox." A rate and a promotion are typed on Airbnb and VRBO directly, because that is where the
 *      promotion badge and the email exposure come from. So this sender writes Hospitable's calendar when it is switched on,
 *      and the response says plainly what that does and does not achieve.
 *
 * Nothing here is wired to a schedule or a button by default: `publishApprovedRates` is only reachable through the route,
 * and the route refuses unless the switch is on.
 */
import { amountFor, calendarBatches, HOSPITABLE_MAX_DATES, type PriceUnit, type PushNightForSend } from './hospitable-write';
import { hospitablePropertyFor, hospitableMissing, type HospitableListing } from './hospitable-properties';

/** Hospitable's calendar write. Documented as `PUT /v2/properties/{uuid}/calendar`. */
const HOSPITABLE_BASE = 'https://public.api.hospitable.com/v2';

export type PublishEnv = {
  HOSPITABLE_PAT?: string;
  /**
   * The older name for the same credential. `push-plan` and `shadow-days` accept either, so a host who set only this one
   * would see the gate open and the switch still reading "no token". Measured on production 2026-11-10: the Pages project
   * lists `HOSPITABLE_PAT` yet every route reports it absent at runtime, so a single-name check is also a single point of
   * wrong answers. Both names are read, and neither is assumed.
   */
  HOSPITABLE_WRITE_TOKEN?: string;
  /** Must be exactly `on`. Anything else means off. */
  HOSPITABLE_RATE_PUSH?: string;
  /** Must be `cents` or `dollars`. There is no default: guessing is a 100x error on a live listing. */
  HOSPITABLE_PRICE_UNIT?: string;
};

/** The credential the request actually carries. One answer, used by the gate and by the sender. */
export function hospitableToken(env: PublishEnv): string {
  return env.HOSPITABLE_PAT?.trim() || env.HOSPITABLE_WRITE_TOKEN?.trim() || '';
}

export type PublishSwitch = {
  /** True only when every condition below is met. */
  on: boolean;
  /** Why it is off, in the owner's words, so a host reading the desk knows what to change. */
  line: string;
  hasToken: boolean;
  unit: PriceUnit | null;
};

/**
 * Is the sending switch on?
 *
 * Four conditions, all required, and the line names the first one that is missing rather than saying "not configured".
 */
export function publishSwitch(env: PublishEnv): PublishSwitch {
  const token = hospitableToken(env);
  const hasToken = token.length > 0;
  const flag = (env.HOSPITABLE_RATE_PUSH ?? '').trim().toLowerCase();
  const rawUnit = (env.HOSPITABLE_PRICE_UNIT ?? '').trim().toLowerCase();
  const unit: PriceUnit | null = rawUnit === 'cents' || rawUnit === 'dollars' ? rawUnit : null;

  if (!hasToken) {
    return {
      on: false,
      hasToken,
      unit,
      /*
       * Not "no token is set": a host who has just added the secret and read this line would go looking for a different
       * problem. The runtime can only report what it can see, and on production 2026-11-10 the Pages project listed
       * `HOSPITABLE_PAT` while this read came back empty — so the honest sentence names what the code observed and what
       * to check, in that order.
       */
      line:
        'Rate publishing is off: this app cannot see a Hospitable token, so nothing can be sent. If one is set on the Pages ' +
        'project, redeploy so the runtime picks it up — a secret added after the last deploy is not visible to it.',
    };
  }
  if (flag !== 'on') {
    return {
      on: false,
      hasToken,
      unit,
      line:
        'Rate publishing is off: the switch is not on. Set HOSPITABLE_RATE_PUSH=on when you want approved prices to leave this app. ' +
        'Until then everything here is a preview.',
    };
  }
  if (unit === null) {
    return {
      on: false,
      hasToken,
      unit,
      line:
        'Rate publishing is off: HOSPITABLE_PRICE_UNIT must be `cents` or `dollars`. It is not defaulted, because the wrong ' +
        'unit prices every night 100 times too high or too low.',
    };
  }
  return {
    on: true,
    hasToken,
    unit,
    line:
      unit === 'cents'
        ? 'Rate publishing is ON. Approved prices will be written to the Hospitable calendar, in cents. A promotion badge still has to be typed on Airbnb or VRBO — Hospitable does not produce one.'
        : 'Rate publishing is ON. Approved prices will be written to the Hospitable calendar, in whole dollars. A promotion badge still has to be typed on Airbnb or VRBO — Hospitable does not produce one.',
  };
}

export type PublishNight = { listing: HospitableListing | string; date: string; rate: number; minStay?: number };

export type PublishOutcome = {
  ok: boolean;
  /** Nights actually sent, by listing. */
  sent: Array<{ listing: string; dates: number; batches: number }>;
  /** Nights refused before a request, with the reason. */
  refused: Array<{ listing: string; date?: string; why: string }>;
  /** One line for a host. */
  line: string;
};

/**
 * Send approved prices.
 *
 * Refuses when the switch is off, when a listing has no Hospitable property in this account, and per night when the rate is
 * not representable in the declared unit. It never guesses a uuid or a unit.
 */
export async function publishApprovedRates(
  env: PublishEnv,
  nights: readonly PublishNight[],
  fetchImpl: typeof fetch = fetch,
): Promise<PublishOutcome> {
  const gate = publishSwitch(env);
  if (!gate.on || gate.unit === null) {
    return { ok: false, sent: [], refused: nights.map((n) => ({ listing: String(n.listing), date: n.date, why: gate.line })), line: gate.line };
  }

  const refused: PublishOutcome['refused'] = [];
  const byProperty = new Map<string, PushNightForSend[]>();

  for (const night of nights) {
    const property = hospitablePropertyFor(night.listing);
    if (!property) {
      refused.push({
        listing: String(night.listing),
        date: night.date,
        why: hospitableMissing().includes(String(night.listing))
          ? 'The Ranch House is not a property in this Hospitable account, so there is no calendar to write to.'
          : 'That listing has no Hospitable property uuid this app can trust.',
      });
      continue;
    }
    if (amountFor(night.rate, gate.unit) === null) {
      refused.push({
        listing: String(night.listing),
        date: night.date,
        why:
          gate.unit === 'cents'
            ? `A rate of ${night.rate} is not a whole number of cents.`
            : `A rate of ${night.rate} is not a price above zero.`,
      });
      continue;
    }
    const list = byProperty.get(property) ?? [];
    list.push({ date: night.date, rate: night.rate });
    byProperty.set(property, list);
  }

  const sent: PublishOutcome['sent'] = [];
  for (const [property, list] of byProperty) {
    const batches = calendarBatches(list, gate.unit);
    if (!Array.isArray(batches)) {
      // The union's failure arm carries `error`; anything that is not a batch list is a refusal, not a send.
      refused.push({ listing: property, why: String((batches as { error?: unknown }).error ?? 'The plan could not be batched.') });
      continue;
    }
    let sentDates = 0;
    for (const body of batches) {
      const res = await fetchImpl(`${HOSPITABLE_BASE}/properties/${property}/calendar`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${hospitableToken(env)}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        refused.push({
          listing: property,
          why: `Hospitable answered ${res.status}. ${res.status === 401 ? 'The token was not accepted, so nothing was published.' : 'Nothing on that batch was published.'}`,
        });
        break;
      }
      sentDates += body.dates.length;
    }
    if (sentDates > 0) sent.push({ listing: property, dates: sentDates, batches: Math.ceil(sentDates / HOSPITABLE_MAX_DATES) });
  }

  const totalSent = sent.reduce((sum, row) => sum + row.dates, 0);
  const line =
    totalSent === 0
      ? 'Nothing was published.'
      : `${totalSent} ${totalSent === 1 ? 'night' : 'nights'} written to the Hospitable calendar. A promotion badge still has to be typed on Airbnb or VRBO; Hospitable does not produce one.`;
  return { ok: totalSent > 0 && refused.length === 0, sent, refused, line };
}
