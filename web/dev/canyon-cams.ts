import { camByKey, camFrameUrl } from '../src/lib/canyon-cams';

/** The same fingerprint the deployed route uses to spot UDOT's "camera is offline" card. */
const OFFLINE_FRAME_SHA256 = 'b9b4dc336246421065a66accf27768af3269a75e48cbacf0624aa2b0e9f59ef9';

/**
 * The road-camera proxy, for `vite` in the browser.
 *
 * The deployed version lives at `functions/api/public/cam.ts`. This is the same lookup, the same offline check, and the
 * same one-minute cache, so a house page renders real UDOT frames locally instead of forty broken images. Local
 * development hits UDOT directly, which is fine at one developer's request rate; the deployed route is the one that keeps
 * the shared cache.
 */
export async function devCanyonCam(key: string): Promise<{ status: number; type: string; body: Buffer } | null> {
  const cam = camByKey(key);
  if (!cam) return null;
  try {
    const response = await fetch(camFrameUrl(cam.id), { signal: AbortSignal.timeout(8000) });
    if (!response.ok) return { status: 502, type: 'application/json', body: Buffer.from('{"ok":false}') };
    const type = response.headers.get('content-type') ?? 'image/jpeg';
    if (!/^image\//i.test(type)) return { status: 502, type: 'application/json', body: Buffer.from('{"ok":false}') };
    const body = Buffer.from(await response.arrayBuffer());
    // An offline camera returns 200 with a placeholder card. Say the camera is down rather than draw that card as live.
    const digest = (await import('node:crypto')).createHash('sha256').update(body).digest('hex');
    if (digest === OFFLINE_FRAME_SHA256) {
      return { status: 503, type: 'application/json', body: Buffer.from('{"ok":false,"reason":"camera is offline"}') };
    }
    return { status: 200, type, body };
  } catch {
    return { status: 502, type: 'application/json', body: Buffer.from('{"ok":false}') };
  }
}
