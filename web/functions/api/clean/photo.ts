import { corsJson } from '../../_lib/data';
import { hostDenied, hostOnly } from '../../_lib/auth';
import { isCleanPhotoPath } from '../../../src/lib/clean-photos';
import { downloadReceipt, storageConfigured } from '../../_lib/gcs';
import type { FirebaseStorageEnv } from '../../_lib/gcs';
import type { SettingsEnv } from '../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv & { DASHBOARD_PASSWORD?: string };

/**
 * Host only. One cleaner room photo, by the path the desk was given. The path still has to be one
 * this app would have written, so a guessed path cannot reach the receipt folder or another house.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const path = new URL(request.url).searchParams.get('path') ?? '';
  if (!isCleanPhotoPath(path)) return corsJson(request, { error: 'That photo is not one of ours.' }, 400);
  if (!storageConfigured(env)) return corsJson(request, { error: 'Photos are not turned on for this site yet.' }, 503);
  try {
    const { bytes, contentType } = await downloadReceipt(env, path);
    return new Response(bytes, {
      status: 200,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, max-age=300' },
    });
  } catch {
    return corsJson(request, { error: 'That photo could not be loaded.' }, 404);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
