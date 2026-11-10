/**
 * The AI is told what it cannot do, and the telling is checked at the prompt, not only at the module.
 *
 * Two things were verified here by reading the real prompt a production-shaped environment builds:
 *
 *   1. **Email.** With no mailbox connected the prompt says "cannot send" and forbids telling a host a guest was
 *      emailed. `gmailHealth` runs the same token path a real send takes, so the line cannot disagree with reality.
 *      This matters most right now, because Gmail is broken on production and every send fails.
 *   2. **Unpriced parts.** All three Riverhouse parts are unset, so none is sellable. The prompt says so and forbids
 *      quoting a rate for one.
 *
 * `part-facts.test.ts` already pins the wording of the second line. What was *not* pinned is that the line reaches the
 * assembled prompt — a module can be right and never be called, which is the recurring defect in this build.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgentContext } from '../../functions/_lib/agent/system-prompt.ts';

/** A KV that answers nothing, which is what a deployment with no saved settings looks like. */
function emptyEnv() {
  const store = new Map<string, string>();
  return {
    SETTINGS: {
      async get(key: string) {
        return store.get(key) ?? null;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
      async list() {
        return { keys: [], list_complete: true };
      },
      async getWithMetadata() {
        return { value: null, metadata: null };
      },
    },
  };
}

test('with no mailbox, the prompt says email cannot send', async () => {
  const ctx = await buildAgentContext(emptyEnv() as never, { month: '2026-11', activeTab: 'guests' } as never);

  const emailLine = ctx.split('\n').find((line) => line.trim().startsWith('Email:')) ?? '';
  assert.ok(emailLine, 'the prompt carries no Email line at all');
  assert.match(emailLine, /cannot send/, 'the prompt does not say email cannot send');
  assert.doesNotMatch(emailLine, /so a send can go out/, 'the prompt claims a send works with no mailbox');

  // And the instruction that keeps the model from claiming otherwise.
  assert.match(
    ctx,
    /Never tell a host a guest was emailed when this line says it cannot send/,
    'the prompt does not forbid claiming a guest was emailed',
  );
});

test('the prompt names the three parts and their capacities', async () => {
  const ctx = await buildAgentContext(emptyEnv() as never, { month: '2026-11', activeTab: 'guests' } as never);
  for (const part of ['Garage Suite', 'Recreation Wing', 'Main Lodge']) {
    assert.ok(ctx.includes(part), `the prompt never names ${part}`);
  }
  // The capacity gap, stated rather than smoothed over.
  assert.match(ctx, /sum to 25 though the house sleeps 24/, 'the prompt hides the capacity gap');
});

test('an unpublished part is described as unsellable, in the prompt itself', async () => {
  /*
   * All three parts are unset in production. This is the assertion that would have caught the line being computed by
   * `partPromptLines` and never reaching the model.
   */
  const ctx = await buildAgentContext(emptyEnv() as never, { month: '2026-11', activeTab: 'guests' } as never);
  assert.match(
    ctx,
    /No part has a price yet, so no part is sellable/,
    'the prompt does not tell the model that no part can be sold',
  );
  assert.match(ctx, /do not invent a nightly rate/, 'the prompt does not forbid inventing a part rate');
});

test('the owner shares are in the prompt, so an owner question is answered from the books', async () => {
  const ctx = await buildAgentContext(emptyEnv() as never, { month: '2026-11', activeTab: 'owner' } as never);
  assert.match(ctx, /Owner shares/, 'the prompt carries no owner shares');
  assert.match(ctx, /Todd/, 'the owner share line does not name Todd');
});
