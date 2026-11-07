import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { createCleanLink, loadCleanLinks, revokeCleanLink } from '../../_lib/clean-link-store';
import { cleanLinkPath } from '../../../src/lib/clean-link';
import { storageReadPaused } from '../../_lib/kv-json';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & { DASHBOARD_PASSWORD?: string };

/** Host only. The links handed to cleaners, with how often each was opened. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  try {
    const links = await loadCleanLinks(env);
    return corsJson(
      request,
      {
        links: links.map((link) => ({
          token: link.token,
          label: link.label,
          path: cleanLinkPath(link.token),
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
    if (storageReadPaused(err)) return corsJson(request, { links: null, storageReads: 'paused' }, 503);
    const message = err instanceof Error ? err.message : 'Clean links failed';
    return corsJson(request, { error: message }, 500);
  }
};

/** Host only. Mint a link for one cleaner. It is not texted or emailed from here. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  let body: { label?: unknown };
  try {
    body = (await request.json()) as { label?: unknown };
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label) return corsJson(request, { error: 'A name for the cleaner is required.' }, 400);
  try {
    const link = await createCleanLink(env, label);
    return corsJson(
      request,
      { token: link.token, label: link.label, path: cleanLinkPath(link.token), createdAt: link.createdAt },
      201,
      { 'Cache-Control': 'no-store' },
    );
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The clean links could not be read. Nothing was written over them.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Clean link failed';
    return corsJson(request, { error: message }, 500);
  }
};

/** Host only. Take a link back. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const token = new URL(request.url).searchParams.get('token') ?? '';
  if (!token) return corsJson(request, { error: 'token is required.' }, 400);
  try {
    const ok = await revokeCleanLink(env, token);
    if (!ok) return corsJson(request, { error: 'Not found' }, 404);
    return corsJson(request, { ok: true }, 200, { 'Cache-Control': 'no-store' });
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'The clean links could not be read. Nothing was written.' }, 503);
    }
    const message = err instanceof Error ? err.message : 'Clean link failed';
    return corsJson(request, { error: message }, 500);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
