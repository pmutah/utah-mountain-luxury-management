import { kvGet, kvPut } from './kv-json';
import type { SettingsEnv } from './kv';
import type { PhotoMeta } from '../../src/lib/clean-photos';

const KV_KEY = 'cleanPhotos';
/** Two weeks of turns across three houses with a dozen photos each, plus slack. */
const KEEP = 600;

export async function loadPhotos(env: SettingsEnv): Promise<PhotoMeta[]> {
  return kvGet<PhotoMeta[]>(env, KV_KEY, []);
}

export async function savePhotos(env: SettingsEnv, photos: PhotoMeta[]): Promise<PhotoMeta[]> {
  return kvPut(env, KV_KEY, photos.slice(-KEEP));
}

/** Every photo on one turn. */
export async function photosForTurn(
  env: SettingsEnv,
  house: string,
  checkout: string,
): Promise<PhotoMeta[]> {
  return (await loadPhotos(env)).filter((photo) => photo.house === house && photo.checkout === checkout);
}

export async function addPhoto(env: SettingsEnv, photo: PhotoMeta): Promise<PhotoMeta[]> {
  const photos = await loadPhotos(env);
  return savePhotos(env, [...photos, photo]);
}

/** Remove one photo row. The caller is responsible for the stored object. */
export async function removePhoto(env: SettingsEnv, path: string): Promise<PhotoMeta | null> {
  const photos = await loadPhotos(env);
  const found = photos.find((photo) => photo.path === path);
  if (!found) return null;
  await savePhotos(env, photos.filter((photo) => photo.path !== path));
  return found;
}

/** The photos a cleaner's page should show for the next two weeks. */
export async function photosSince(env: SettingsEnv, from: string): Promise<PhotoMeta[]> {
  return (await loadPhotos(env)).filter((photo) => photo.checkout >= from);
}
