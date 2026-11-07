import { corsJson } from '../../../_lib/data';
import { isCleanPhotoPath } from '../../../../src/lib/clean-photos';
import { isCleanToken } from '../../../../src/lib/clean-link';
import { findCleanLink } from '../../../_lib/clean-link-store';
import { downloadReceipt, storageConfigured } from '../../../_lib/gcs';
import { getAllReservations } from '../../../_lib/reservations-store';
import { buildTurnovers } from '../../../../src/lib/today';
import { denverToday } from '../../../../src/lib/market/dates';
import type { HouseId } from '../../../../src/lib/market/types';
import type { FirebaseStorageEnv } from '../../../_lib/gcs';
import type { SettingsEnv } from '../../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv;

/**
 * The houses on this cleaner's list: the ones with a turnover in the same two-week window the clean
 * page shows. It reads the same `buildTurnovers` the listing route does, so a photo the listing shows
 * is a photo this read allows and the two cannot drift apart.
 */
async function cleanerHouses(env: SettingsEnv): Promise<HouseId[]> {
  const stays = await getAllReservations(env);
  const turns = buildTurnovers(stays as never, denverToday(), 14);
  return [...new Set(turns.map((turn) => turn.house))] as HouseId[];
}

/**
 * One cleaner photo. The link token is the credential, and the path has to be one this app would
 * have written, so a caller cannot read another folder by guessing a path.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const token = String(params.token ?? '');
  if (!isCleanToken(token)) return corsJson(request, { error: 'This clean link is not valid.' }, 404);
  const link = await findCleanLink(env, token).catch(() => null);
  if (!link) return corsJson(request, { error: 'This clean link is not valid.' }, 404);

  const path = new URL(request.url).searchParams.get('path') ?? '';
  if (!isCleanPhotoPath(path)) return corsJson(request, { error: 'That photo is not one of ours.' }, 400);
  /*
   * The path shape alone is not enough. `isCleanPhotoPath` accepts any house, so a cleaner holding a
   * valid link could ask for another house's photo; only an unguessable filename stood in the way, and
   * a guard should not rest on that. The house in the path has to be on this cleaner's own list.
   */
  const housesOnList = await cleanerHouses(env);
  if (!housesOnList.includes(path.split('/')[1] as HouseId)) {
    return corsJson(request, { error: 'That photo is not on this list.' }, 404);
  }
  if (!storageConfigured(env)) return corsJson(request, { error: 'Photos are not turned on for this site yet.' }, 503);

  try {
    const { bytes, contentType } = await downloadReceipt(env, path);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return corsJson(request, { error: 'That photo could not be loaded.' }, 404);
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);

