import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { publishApprovedRates, publishSwitch, type PublishNight } from '../../../src/lib/market/rate-publish';
import { hospitableMapLine } from '../../../src/lib/market/hospitable-properties';
import { loadApprovedRates } from '../../_lib/pricing-store';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & {
  DASHBOARD_PASSWORD?: string;
  HOSPITABLE_PAT?: string;
  HOSPITABLE_RATE_PUSH?: string;
  HOSPITABLE_PRICE_UNIT?: string;
  HOSPITABLE_WRITE_TOKEN?: string;
};

/**
 * Publish the host's approved prices to the channel.
 *
 * **This is the only route in the app that can send a price anywhere, and it is off unless the owner turns it on.** The
 * switch is `HOSPITABLE_RATE_PUSH=on`, and `HOSPITABLE_PRICE_UNIT` must name `cents` or `dollars` — an unset unit is refused
 * rather than defaulted, because the two differ by 100x on a live listing.
 *
 * GET reads the switch and says what would happen. It sends nothing and needs no token to answer.
 * POST sends, and refuses when the switch is off, naming which condition is missing.
 *
 * What this does **not** do, and says so: a promotion badge is not produced. The doctrine keeps promotions on Airbnb and VRBO
 * because that is where the badge and the email exposure come from, so a discounted rate written here is a plain lower price
 * with no marketing attached.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const gate = publishSwitch(env);
  return corsJson(
    request,
    {
      switch: gate.on ? 'on' : 'off',
      line: gate.line,
      hasToken: gate.hasToken,
      unit: gate.unit,
      /** The property map, so a host can see exactly where a price would land. */
      properties: hospitableMapLine(),
      /** Said every time, because it is the part that surprises people. */
      promotionNote:
        'A rate written here changes the nightly price only. It does not create an Airbnb or VRBO promotion badge, and the discount will not appear in their marketing. Type the promotion on those sites.',
      publishes: false,
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);

  const gate = publishSwitch(env);
  if (!gate.on) {
    /*
     * Refused before any read or write. Off means off: not "off but it tried", and not a partial send with a warning.
     */
    return corsJson(request, { ok: false, sent: [], refused: [], line: gate.line, switch: 'off' }, 409, {
      'Cache-Control': 'no-store',
    });
  }

  /*
   * Only the host's own approved prices are sent — never a proposed, shadow, or promotion figure. An approved rate is the one
   * number a person has looked at and said yes to, and it is the only thing the doctrine permits to leave this app.
   *
   * Every row carries a **house**, because `toApprovedRate` and the approve routes only ever accept `ranch`, `lindon`, or
   * `river` — a Riverhouse part cannot enter this sheet. So the listing below is always the whole house. An earlier version of
   * this comment claimed a part would publish under its own property; no such row can exist, and the map keys parts by unit id
   * which this route would never produce.
   */
  let approved;
  try {
    approved = await loadApprovedRates(env);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(
        request,
        { ok: false, sent: [], refused: [], line: 'Approved prices could not be read. Nothing was published.' },
        503,
      );
    }
    throw err;
  }

  if (approved.length === 0) {
    return corsJson(
      request,
      {
        ok: false,
        sent: [],
        refused: [],
        line: 'No approved prices to publish. Approve a night on the pricing desk first — this route never sends a proposed or shadow rate.',
        switch: 'on',
      },
      200,
    );
  }

  /*
   * The listing is always the whole house. Every row on this sheet carries a house — `toApprovedRate` and both approve routes
   * accept only `ranch`, `lindon`, or `river`, so a Riverhouse part cannot enter it and there is no unit id to map. An earlier
   * comment here claimed a part would publish under its own property; that row cannot exist.
   */
  const nights: PublishNight[] = approved.map((row) => ({
    listing: row.house,
    date: row.date,
    rate: row.guest,
  }));

  const outcome = await publishApprovedRates(env, nights);
  return corsJson(
    request,
    {
      ...outcome,
      switch: 'on',
      properties: hospitableMapLine(),
      promotionNote:
        'A rate written here changes the nightly price only. It does not create an Airbnb or VRBO promotion badge.',
      publishes: outcome.ok,
    },
    outcome.ok ? 200 : 409,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
