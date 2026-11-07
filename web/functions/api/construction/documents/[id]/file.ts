import { hostDenied, hostOnly } from '../../../../_lib/auth';
import { loadConstructionFile } from '../../../../_lib/construction/construction-doc-store';
import { getConstructionDocument } from '../../../../_lib/construction/construction-store';
import { readOrRefuse } from '../../../../_lib/read-guard';
import type { ConstructionEnv } from '../../../../_lib/construction/types';

export const onRequestGet: PagesFunction<ConstructionEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = params.id as string;
  const read = await readOrRefuse(request, () => getConstructionDocument(env, id), 'Construction documents');
  if (!read.ok) return read.response;
  const doc = read.value;
  if (!doc?.storagePath) {
    return new Response('No file', { status: 404 });
  }

  try {
    const { bytes, contentType } = await loadConstructionFile(env, doc.storagePath);
    return new Response(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename="${encodeURIComponent(doc.title)}.pdf"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch {
    return new Response('File not found', { status: 404 });
  }
};
