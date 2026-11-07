import { corsJson } from '../_lib/data';
import { hostOnly, unauthorized } from '../_lib/auth';
import { readOrRefuse } from '../_lib/read-guard';
import { enableHold, guideReadiness } from '../../src/lib/guest-app-ready';
import { GUIDE_HOUSE_IDS, loadGuides, saveGuide, type GuideHouseId, type HouseGuide } from '../_lib/guest-guide';
import type { AgentEnv } from '../_lib/agent/types';

type Env = AgentEnv & { DASHBOARD_PASSWORD?: string };

/** Every field a guest must not read without unlocking the stay phone. */
const SECRET_FIELDS = ['doorCode', 'wifiPassword', 'wifiName', 'doorNotes'] as const;

/**
 * Host only. The editor needs the whole guide, and the door code is part of what the host edits.
 * A public caller used to get this payload too, including the Wi-Fi password, so the read is now
 * gated and the secrets are stripped from anything that is not signed in.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  // A host is only a host when a password exists and the cookie matches. Treating "no password
  // configured" as "signed in" is what leaked the Wi-Fi password from this route.
  const host = hostOnly(request, env);
  const read = await readOrRefuse(request, () => loadGuides(env), 'The house guides');
  if (!read.ok) return read.response;
  const guides = read.value;
  if (host) {
    return corsJson(request, { guides }, 200, { 'Cache-Control': 'no-store' });
  }
  // A public read keeps the published facts and drops the way in.
  const publicGuides = GUIDE_HOUSE_IDS.reduce(
    (out, id) => {
      const copy: HouseGuide = { ...guides[id] };
      for (const secret of SECRET_FIELDS) copy[secret] = '';
      out[id] = copy;
      return out;
    },
    {} as Record<GuideHouseId, HouseGuide>,
  );
  return corsJson(
    request,
    { guides: publicGuides, signedIn: false },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return unauthorized(request);
  let body: { propertyId?: string; guide?: Partial<HouseGuide> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  if (!GUIDE_HOUSE_IDS.includes(body.propertyId as GuideHouseId) || !body.guide) {
    return corsJson(request, { error: 'propertyId (ranch|lindon|river) and guide required' }, 400);
  }
  if ('enabled' in body.guide) body.guide.enabled = body.guide.enabled === true;
  // Turning a house on has to pass the same readiness check the editor shows, so a blank app cannot
  // go live through the API even if the switch is bypassed.
  if (body.guide.enabled === true) {
    const read = await readOrRefuse(request, () => loadGuides(env), 'The house guides');
    if (!read.ok) return read.response;
    const merged = { ...read.value[body.propertyId as GuideHouseId], ...body.guide };
    const hold = enableHold(merged);
    if (hold) return corsJson(request, { error: hold, ready: false }, 409);
  }
  const guide = await saveGuide(env, body.propertyId as GuideHouseId, body.guide);
  return corsJson(request, { ok: true, guide, readiness: guideReadiness(guide) });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
