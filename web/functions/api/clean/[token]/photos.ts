import { corsJson } from '../../../_lib/data';
import {
  PHOTO_MAX_BYTES,
  checkPhoto,
  isCleanPhotoPath,
  photoStoragePath,
  photoLabel,
  photoLine,
  type PhotoMeta,
} from '../../../../src/lib/clean-photos';
import { isCleanToken } from '../../../../src/lib/clean-link';
import { resolveCleanLink } from '../../../_lib/clean-auth';
import { addPhoto, photosForTurn, removePhoto } from '../../../_lib/clean-photo-store';
import { buildTurnovers } from '../../../../src/lib/today';
import { getAllReservations } from '../../../_lib/reservations-store';
import { deleteReceipt, storageConfigured, uploadStorageObject } from '../../../_lib/gcs';
import { storageReadPaused } from '../../../_lib/kv-json';
import { denverToday } from '../../../../src/lib/market/dates';
import type { FirebaseStorageEnv } from '../../../_lib/gcs';
import type { HouseId } from '../../../../src/lib/market/types';
import type { SettingsEnv } from '../../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv;

const HOUSES: string[] = ['river', 'ranch', 'lindon'];

function isHouse(id: string): id is HouseId {
  return HOUSES.includes(id);
}

/** The turn has to be on this cleaner's list before a photo can be attached to it. */
async function turnOnList(env: SettingsEnv, house: string, checkout: string): Promise<boolean> {
  if (!isHouse(house)) return false;
  const stays = await getAllReservations(env);
  return buildTurnovers(stays as never, denverToday(), 14).some(
    (turn) => turn.house === house && turn.checkout === checkout,
  );
}

/**
 * A cleaner's room photos for one turn. The link is the credential, and the turn has to be on that
 * cleaner's list. Reading returns a label and a time, never a guest name.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  if (!isCleanToken(token)) return corsJson(request, { error: 'This clean link is not valid.' }, 404);
  const resolved = await resolveCleanLink(env, token, request);
  if ('response' in resolved) return resolved.response;

  const url = new URL(request.url);
  const house = url.searchParams.get('house') ?? '';
  const checkout = url.searchParams.get('checkout') ?? '';
  if (!isHouse(house) || !/^\d{4}-\d{2}-\d{2}$/.test(checkout)) {
    return corsJson(request, { error: 'A house and a checkout day are required.' }, 400);
  }
  let photos: PhotoMeta[];
  try {
    photos = await photosForTurn(env, house, checkout);
  } catch (err) {
    if (storageReadPaused(err)) return corsJson(request, { photos: null, storageReads: 'paused' }, 503);
    const message = err instanceof Error ? err.message : 'Photos failed';
    return corsJson(request, { error: message }, 500);
  }
  return corsJson(
    request,
    {
      photos: photos.map((photo) => ({
        path: photo.path,
        label: photoLabel(photo),
        uploadedAt: photo.uploadedAt,
        url: `/api/clean/${encodeURIComponent(token)}/photo?path=${encodeURIComponent(photo.path)}`,
      })),
      line: photoLine(photos.length),
      storageConfigured: storageConfigured(env),
      storageReads: 'ok',
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
};

/**
 * Attach one photo. The body is JSON with base64 so the route stays a normal request. Size is
 * measured on the decoded bytes, so a caller cannot claim a small file and send a large one.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  if (!isCleanToken(token)) return corsJson(request, { error: 'This clean link is not valid.' }, 404);
  const resolved = await resolveCleanLink(env, token, request);
  if ('response' in resolved) return resolved.response;
  if (!storageConfigured(env)) {
    return corsJson(request, { error: 'Photos are not turned on for this site yet.' }, 503);
  }

  let body: { house?: unknown; checkout?: unknown; contentType?: unknown; base64?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }
  const house = typeof body.house === 'string' ? body.house : '';
  const checkout = typeof body.checkout === 'string' ? body.checkout : '';
  if (!isHouse(house)) return corsJson(request, { error: 'A house is required.' }, 400);

  let onList = false;
  try {
    onList = await turnOnList(env, house, checkout);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'Saved bookings could not be read. Nothing was written.' }, 503);
    }
    throw err;
  }
  if (!onList) return corsJson(request, { error: 'That turnover is not on the list for this link.' }, 404);

  if (typeof body.base64 !== 'string') return corsJson(request, { error: 'A photo is required.' }, 400);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(body.base64), (char) => char.charCodeAt(0));
  } catch {
    return corsJson(request, { error: 'That photo could not be read.' }, 400);
  }

  let stored: PhotoMeta[];
  try {
    stored = await photosForTurn(env, house, checkout);
  } catch (err) {
    if (storageReadPaused(err)) {
      return corsJson(request, { error: 'Photos could not be read. Nothing was written.' }, 503);
    }
    throw err;
  }
  const check = checkPhoto({ contentType: body.contentType, bytes: bytes.byteLength, alreadyStored: stored.length });
  if (!check.ok) return corsJson(request, { error: check.reason }, 400);

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  const path = photoStoragePath(house, checkout, id, check.contentType);
  if (!path) return corsJson(request, { error: 'That photo could not be stored.' }, 400);

  try {
    await uploadStorageObject(env, path, bytes, check.contentType, PHOTO_MAX_BYTES);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return corsJson(request, { error: message }, 502);
  }
  const photo: PhotoMeta = {
    house,
    checkout,
    path,
    contentType: check.contentType,
    bytes: bytes.byteLength,
    uploadedAt: new Date().toISOString(),
  };
  const photos = await addPhoto(env, photo);
  const onTurn = photos.filter((row) => row.house === house && row.checkout === checkout);
  return corsJson(
    request,
    {
      ok: true,
      path,
      url: `/api/clean/${encodeURIComponent(token)}/photo?path=${encodeURIComponent(path)}`,
      line: photoLine(onTurn.length),
    },
    201,
    { 'Cache-Control': 'no-store' },
  );
};

/** Take one photo back off a turn. The stored object goes too. */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  if (!isCleanToken(token)) return corsJson(request, { error: 'This clean link is not valid.' }, 404);
  const resolved = await resolveCleanLink(env, token, request);
  if ('response' in resolved) return resolved.response;

  const path = new URL(request.url).searchParams.get('path') ?? '';
  if (!isCleanPhotoPath(path)) return corsJson(request, { error: 'That photo is not one of ours.' }, 400);
  const removed = await removePhoto(env, path).catch(() => null);
  if (!removed) return corsJson(request, { error: 'Not found' }, 404);
  await deleteReceipt(env, path).catch(() => undefined);
  return corsJson(request, { ok: true }, 200, { 'Cache-Control': 'no-store' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
