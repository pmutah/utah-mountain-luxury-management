import type { GeminiPart } from '../gemini-call';

const GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.0-flash', 'gemini-2.5-flash'] as const;

export type GeminiFunctionDeclaration = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type GeminiContent = {
  role: 'user' | 'model';
  parts: Array<
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> } }
    | { functionResponse: { name: string; response: Record<string, unknown> } }
  >;
};

export type GeminiAgentTurn = {
  text?: string;
  functionCalls?: Array<{ name: string; args: Record<string, unknown> }>;
};

async function callOnce(
  apiKey: string,
  model: string,
  contents: GeminiContent[],
  tools: GeminiFunctionDeclaration[],
): Promise<GeminiAgentTurn> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        tools: [{ functionDeclarations: tools }],
        toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
        generationConfig: { temperature: 0.2 },
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini agent error ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          text?: string;
          functionCall?: { name: string; args?: Record<string, unknown> };
        }>;
      };
    }>;
  };
  const parts = json.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text).filter(Boolean).join('');
  const functionCalls = parts
    .filter((p) => p.functionCall?.name)
    .map((p) => ({
      name: p.functionCall!.name,
      args: (p.functionCall!.args ?? {}) as Record<string, unknown>,
    }));
  return { text: text || undefined, functionCalls: functionCalls.length ? functionCalls : undefined };
}

export async function generateAgentTurn(
  apiKey: string,
  systemPrompt: string,
  contents: GeminiContent[],
  tools: GeminiFunctionDeclaration[],
): Promise<GeminiAgentTurn> {
  const withSystem: GeminiContent[] = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood. I am your property co-host ready to help.' }] },
    ...contents,
  ];

  let lastError = 'Gemini unavailable';
  for (const model of GEMINI_MODELS) {
    try {
      return await callOnce(apiKey, model, withSystem, tools);
    } catch (e) {
      lastError = e instanceof Error ? e.message : lastError;
    }
  }
  throw new Error(lastError);
}

export function userMessage(text: string): GeminiContent {
  return { role: 'user', parts: [{ text }] };
}

export function modelText(text: string): GeminiContent {
  return { role: 'model', parts: [{ text }] };
}

export function modelFunctionCalls(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
): GeminiContent {
  return {
    role: 'model',
    parts: calls.map((c) => ({ functionCall: { name: c.name, args: c.args } })),
  };
}

export function toolResults(
  results: Array<{ name: string; response: Record<string, unknown> }>,
): GeminiContent {
  return {
    role: 'user',
    parts: results.map((r) => ({ functionResponse: { name: r.name, response: r.response } })),
  };
}

export type { GeminiPart };
