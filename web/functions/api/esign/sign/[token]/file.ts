import { findSessionByToken, getVaultDocument } from '../../../../_lib/esign/esign-store';
import { loadEsignFile } from '../../../../_lib/esign/esign-file-store';
import { withPausedGuard } from '../../../../_lib/read-guard';
import type { FirebaseStorageEnv } from '../../../../_lib/gcs';
import type { SettingsEnv } from '../../../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv;

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) =>
  withPausedGuard(
    request,
    () => signFile(request, env, params),
    'This signed document',
  );

async function signFile(_request: Request, env: Env, params: { token?: unknown }): Promise<Response> {
  const token = String(params.token ?? '');
  const session = await findSessionByToken(env, token);
  if (!session) return new Response('Not found', { status: 404 });

  const doc = await getVaultDocument(env, session.documentId);
  const path = session.completedAt ? doc?.signedStoragePath ?? doc?.storagePath : doc?.storagePath;
  if (!doc || !path) return new Response('No file', { status: 404 });

  try {
    const { bytes, contentType } = await loadEsignFile(env, path);
    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.title)}.pdf"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch {
    return new Response('File not found', { status: 404 });
  }
};
