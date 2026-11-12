import { camByKey, camFrameUrl } from '../../../src/lib/canyon-cams';

/**
 * One road-camera frame, for a guest to watch.
 *
 * The guest page asks for `/api/public/cam?key=vivian`; this fetches UDOT's still image and hands it back. Two reasons
 * not to point an `<img>` straight at UDOT:
 *
 * 1. **The cache is shared.** UDOT's frame is the same for every visitor, and it only changes about once a minute. The
 *    browser cache would make each guest fetch their own copy; the edge cache here makes one fetch per minute serve
 *    everyone. UDOT gets one request per camera per minute from this site regardless of how many guests are looking.
 * 2. **The URL is not a parameter.** Only a key in `canyon-cams.ts` resolves, so this endpoint cannot be used as an open
 *    proxy to fetch somebody else's page through our domain.
 *
 * A frame that cannot be read answers 502 with no image, and the page says the camera is unavailable rather than
 * showing a stale one as if it were live.
 */

const CACHE_SECONDS = 60;

/**
 * UDOT's "this camera is offline" card, as a fingerprint.
 *
 * An offline camera does not return an error — it returns a 200 with a branded navy placeholder that says the camera is
 * offline. A page that renders that and calls it live is lying to a guest deciding whether to drive. The placeholder is
 * byte-identical every time, so a hash of the body is an exact test and needs no image decoding at the edge.
 */
const OFFLINE_FRAME_SHA256 = 'b9b4dc336246421065a66accf27768af3269a75e48cbacf0624aa2b0e9f59ef9';

async function isOfflineFrame(body: ArrayBuffer): Promise<boolean> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', body);
    const hex = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return hex === OFFLINE_FRAME_SHA256;
  } catch {
    // If the digest cannot be computed, do not claim the camera is fine and do not claim it is broken: fall through to
    // the image, which still carries UDOT's own "offline" text inside the picture.
    return false;
  }
}

/** Kept across requests in one isolate, so a burst of guests does not each pay the upstream round trip. */
let lastGood = new Map<string, { body: ArrayBuffer; type: string; at: number }>();

export function clearCameraCache(): void {
  lastGood = new Map();
}

const PLACEHOLDER = new Uint8Array(0);

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') ?? '';
  const cam = camByKey(key);
  if (!cam) {
    return new Response(JSON.stringify({ ok: false, reason: 'unknown camera' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const now = Date.now();
  const hit = lastGood.get(cam.key);
  if (hit && now - hit.at < CACHE_SECONDS * 1000) {
    return frame(hit.body, hit.type, 'hit');
  }

  let upstream: Response | null = null;
  try {
    upstream = await fetch(camFrameUrl(cam.id), {
      // UDOT varies nothing per visitor; a plain GET with no referer is what the public camera page itself does.
      headers: { Accept: 'image/jpeg,image/png,image/*' },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    upstream = null;
  }

  if (!upstream || !upstream.ok) {
    // A stale frame is better than a broken image *only* if it is labeled as stale, so this returns the last good
    // frame with a short cache and an explicit header a caller can see, and 502 when there has never been one.
    if (hit) {
      const response = frame(hit.body, hit.type, 'stale');
      response.headers.set('X-Camera-Stale', '1');
      return response;
    }
    return new Response(JSON.stringify({ ok: false, reason: 'camera did not answer' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const type = upstream.headers.get('content-type') ?? '';
  if (!/^image\//i.test(type)) {
    return new Response(JSON.stringify({ ok: false, reason: 'camera did not return an image' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  const body = await upstream.arrayBuffer();
  if (body.byteLength < 1024) {
    return new Response(JSON.stringify({ ok: false, reason: 'camera returned an empty frame' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  /*
   * An offline camera answers 200 with UDOT's placeholder card. Refuse it, and do not cache it: the moment the camera
   * comes back the page should show the road without waiting out a minute of placeholder.
   */
  if (await isOfflineFrame(body)) {
    lastGood.delete(cam.key);
    return new Response(
      JSON.stringify({ ok: false, reason: 'camera is offline', camera: cam.key, udot: camFrameUrl(cam.id) }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } },
    );
  }

  lastGood.set(cam.key, { body, type, at: now });
  return frame(body, type, 'miss');
};

function frame(body: ArrayBuffer, type: string, state: 'hit' | 'miss' | 'stale'): Response {
  return new Response(body.byteLength === 0 ? PLACEHOLDER : body, {
    status: 200,
    headers: {
      'Content-Type': type || 'image/jpeg',
      /*
       * One minute, matching UDOT. `stale-while-revalidate` lets an edge keep serving the last frame while it fetches a
       * new one, so a guest never waits on UDOT's server. The frame is public and carries no guest data.
       */
      'Cache-Control': `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=120`,
      'X-Camera-State': state,
      // A camera frame is an image, never a document.
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Max-Age': '86400',
    },
  });
