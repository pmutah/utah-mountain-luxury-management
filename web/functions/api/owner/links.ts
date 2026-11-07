import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { createOwnerLink, loadOwnerLinks } from '../../_lib/owner-store';
import { ownerPortalPath } from '../../../src/lib/owner-portal';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

/** Host only. Reads the minted owner links, or mints a new one. Nothing is booked or sent. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const links = await loadOwnerLinks(env);
    return corsJson(
      request,
      {
        links: links.map((link) => ({
          token: link.token,
          path: ownerPortalPath(link.token),
          createdAt: link.createdAt,
          lastViewedAt: link.lastViewedAt ?? null,
          views: link.views ?? 0,
        })),
        storageReads: 'ok',
      },
      200,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { links: null, storageReads: 'paused' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Owner links failed';
    return corsJson(request, { error: message }, 500);
  }
};

/** Host only. Mints one link. It does not email it. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const link = await createOwnerLink(env);
    return corsJson(
      request,
      { token: link.token, path: ownerPortalPath(link.token), createdAt: link.createdAt },
      201,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The owner links could not be read. Nothing was written over them.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Owner link failed';
    return corsJson(request, { error: message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
