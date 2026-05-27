/** Keep in sync with web/functions/_lib/gemini-call.ts */

export type GeminiPart = {
  text?: string;
  inline_data?: { mime_type: string; data: string };
};

const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash'] as const;

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 529]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseErrorMessage(status: number, body: string): string {
  try {
    const json = JSON.parse(body) as { error?: { message?: string } };
    const msg = json.error?.message?.trim();
    if (msg) return msg;
  } catch {
    // ignore
  }
  return body.slice(0, 240) || `HTTP ${status}`;
}

export function formatGeminiFailure(status: number, body: string): string {
  const detail = parseErrorMessage(status, body);
  if (status === 503 || /high demand|overloaded|unavailable/i.test(detail)) {
    return 'Google Gemini is busy right now (high demand). Wait about a minute and try again.';
  }
  if (status === 429) {
    return 'Too many scan requests. Wait a minute and try again.';
  }
  return `Gemini API error (${status}): ${detail}`;
}

async function requestOnce(
  apiKey: string,
  model: string,
  parts: GeminiPart[],
): Promise<{ ok: true; text: string } | { ok: false; status: number; body: string }> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      }),
    },
  );

  if (!res.ok) {
    return { ok: false, status: res.status, body: await res.text() };
  }

  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return { ok: false, status: 502, body: 'Empty response from Gemini' };
  }
  return { ok: true, text };
}

export async function generateGeminiJson(apiKey: string, parts: GeminiPart[]): Promise<string> {
  const maxAttemptsPerModel = 4;
  let lastMessage =
    'Google Gemini is busy right now. Wait about a minute and try again, or scan one bill at a time.';

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < maxAttemptsPerModel; attempt++) {
      try {
        const result = await requestOnce(apiKey, model, parts);
        if (result.ok) return result.text;

        lastMessage = formatGeminiFailure(result.status, result.body);
        if (!RETRYABLE_STATUS.has(result.status)) {
          throw new Error(lastMessage);
        }

        if (attempt < maxAttemptsPerModel - 1) {
          await sleep(1200 * 2 ** attempt);
          continue;
        }
        break;
      } catch (e) {
        if (e instanceof Error && e.message.includes('Gemini API error')) throw e;
        lastMessage = e instanceof Error ? e.message : 'Network error calling Gemini';
        if (attempt < maxAttemptsPerModel - 1) {
          await sleep(1200 * 2 ** attempt);
          continue;
        }
        break;
      }
    }
  }

  throw new Error(lastMessage);
}
