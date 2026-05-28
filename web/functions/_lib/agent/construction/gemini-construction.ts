import type { GeminiContent, GeminiFunctionDeclaration, GeminiAgentTurn } from '../gemini-agent';

const CONSTRUCTION_MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'] as const;

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
    throw new Error(`Gemini construction error ${res.status}: ${body.slice(0, 200)}`);
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

export async function generateConstructionTurn(
  apiKey: string,
  systemPrompt: string,
  contents: GeminiContent[],
  tools: GeminiFunctionDeclaration[],
): Promise<GeminiAgentTurn> {
  const withSystem: GeminiContent[] = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    {
      role: 'model',
      parts: [
        {
          text: 'Understood. I am your Construction Manager — superintendent-level guidance across architecture, engineering, contracting, and all trades. I ground advice in your project documents and our knowledge library.',
        },
      ],
    },
    ...contents,
  ];

  let lastError = 'Gemini unavailable';
  for (const model of CONSTRUCTION_MODELS) {
    try {
      return await callOnce(apiKey, model, withSystem, tools);
    } catch (e) {
      lastError = e instanceof Error ? e.message : lastError;
    }
  }
  throw new Error(lastError);
}

export {
  userMessage,
  modelText,
  modelFunctionCalls,
  toolResults,
} from '../gemini-agent';
