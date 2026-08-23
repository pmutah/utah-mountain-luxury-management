import { getVaultDocument } from '../../../../_lib/esign/esign-store';
import { loadEsignFile } from '../../../../_lib/esign/esign-file-store';
import type { FirebaseStorageEnv } from '../../../../_lib/gcs';
import type { SettingsEnv } from '../../../../_lib/kv';

type Env = SettingsEnv & FirebaseStorageEnv;

export const onRequestGet: PagesFunction<Env> = async ({ request, env, params }) => {
  const id = String(params.id ?? '');
  const doc = await getVaultDocument(env, id);
  if (!doc) return new Response('Not found', { status: 404 });

  const kind = new URL(request.url).searchParams.get('kind');
  const wantSigned = kind === 'signed';
  const storagePath = wantSigned ? doc.signedStoragePath ?? null : doc.storagePath;
  if (!storagePath) return new Response('No file', { status: 404 });

  try {
    const { bytes, contentType } = await loadEsignFile(env, storagePath);
    const base = (wantSigned ? `${doc.title}-signed` : doc.title).replace(/[^\w.-]+/g, '_');
    const ext = contentType === 'application/pdf' ? 'pdf' : 'bin';
    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${base}.${ext}"`,
        'Cache-Control': 'private, max-age=120',
      },
    });
  } catch {
    return new Response('File not found', { status: 404 });
  }
};
