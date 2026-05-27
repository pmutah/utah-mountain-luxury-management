import { corsJson } from '../../_lib/data';
import type { AgentEnv } from '../../_lib/agent/types';

export const onRequestPost: PagesFunction<AgentEnv> = async ({ request, env }) => {
  const openaiKey = env.OPENAI_API_KEY?.trim();
  if (!openaiKey) {
    return corsJson(
      request,
      { error: 'Voice transcription not configured (OPENAI_API_KEY). Use keyboard input.' },
      503,
    );
  }

  let body: { audioBase64?: string; mimeType?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return corsJson(request, { error: 'Invalid JSON' }, 400);
  }

  if (!body.audioBase64) {
    return corsJson(request, { error: 'audioBase64 required' }, 400);
  }

  const binary = atob(body.audioBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: body.mimeType ?? 'audio/webm' }), 'audio.webm');
  form.append('model', 'whisper-1');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: form,
  });

  if (!res.ok) {
    return corsJson(request, { error: `Transcription failed: ${res.status}` }, 502);
  }

  const json = (await res.json()) as { text?: string };
  return corsJson(request, { text: json.text ?? '' });
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
