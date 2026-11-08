import assert from 'node:assert/strict';
import test from 'node:test';
import { runAgentChat } from './run-agent.ts';
import type { AgentEnv } from './types';

/*
 * These drive the real loop against a stubbed Gemini endpoint, because the bug they cover was not in
 * any one function: it was in what the loop sent back to the model between turns. A model that
 * answered a tool call with empty text got "Done." written into the transcript, so a host who asked
 * for a number was told the work was finished and never saw the number.
 */

type Body = {
  contents: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
};

/** One canned Gemini reply, in the shape the API returns. */
function geminiText(text: string) {
  return { candidates: [{ content: { parts: [{ text }] } }] };
}

function geminiCall(name: string, args: Record<string, unknown>) {
  return { candidates: [{ content: { parts: [{ functionCall: { name, args } }] } }] };
}

/**
 * Replace fetch for one test and record every request body the loop sends, so a test can assert on
 * what the model was told rather than only on what came back.
 */
async function withGemini(
  replies: unknown[],
  run: (sent: Body[]) => Promise<void>,
): Promise<void> {
  const real = globalThis.fetch;
  const sent: Body[] = [];
  let i = 0;
  globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
    sent.push(JSON.parse(String(init?.body ?? '{}')) as Body);
    const reply = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return new Response(JSON.stringify(reply), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  try {
    await run(sent);
  } finally {
    globalThis.fetch = real;
  }
}

/** An env with no KV: every read falls back, so nothing is written during a test. */
const ENV = { GEMINI_API_KEY: 'test-key' } as unknown as AgentEnv;

function allText(body: Body): string {
  return body.contents
    .flatMap((c) => c.parts.map((p) => String(p.text ?? '')))
    .join('\n');
}

test('after a tool result the model is told to answer in words, not left to infer it', async () => {
  await withGemini(
    [
      geminiCall('manage_pricing', { action: 'list_comp_set' }),
      geminiText('You have no saved comps yet, so the rate band cannot activate.'),
    ],
    async (sent) => {
      const res = await runAgentChat(ENV, 'How many comps do I have?');

      // Two turns: the tool call, then the answer.
      assert.equal(sent.length, 2, 'expected a tool turn and an answer turn');

      /*
       * The second turn must carry an instruction. Without it the loop `continue`d with only the
       * tool's JSON in front of the model, and an empty reply was common enough that the code
       * papered over it with the word "Done.".
       */
      const second = allText(sent[1]!);
      assert.match(
        second,
        /answer the question in plain language/i,
        'the model must be told to answer after a tool result',
      );
      assert.match(
        second,
        /do not reply with a single word/i,
        'a one-word non-answer is what this instruction exists to prevent',
      );

      assert.match(res.reply, /no saved comps/i);
      assert.equal(res.toolSteps.length, 1);
      assert.equal(res.toolSteps[0]!.tool, 'manage_pricing');
    },
  );
});

test('an empty reply after a tool call names the tools instead of saying Done', async () => {
  await withGemini(
    [
      geminiCall('manage_pricing', { action: 'list_comp_set' }),
      // The failure the old code hid: no text, no calls.
      { candidates: [{ content: { parts: [] } }] },
    ],
    async () => {
      const res = await runAgentChat(ENV, 'How many comps do I have?');

      assert.notEqual(res.reply.trim().toLowerCase(), 'done.');
      assert.doesNotMatch(
        res.reply,
        /^done\.?$/i,
        'the host needs to know what ran, not that something finished',
      );
      assert.match(
        res.reply,
        /manage_pricing/,
        'naming the tool is the one true thing the reply can say with no model text',
      );
    },
  );
});

test('a question that needs no tool still returns the model answer unchanged', async () => {
  await withGemini([geminiText('The Ranch is 50/50 after the 20% fee.')], async (sent) => {
    const res = await runAgentChat(ENV, 'How is the Ranch split?');
    assert.equal(sent.length, 1);
    assert.match(res.reply, /50\/50/);
    assert.equal(res.toolSteps.length, 0);
  });
});
