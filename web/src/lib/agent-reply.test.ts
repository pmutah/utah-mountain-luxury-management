/**
 * A reply of "Done." is not an answer.
 *
 * The agent loop read `result.text?.trim() ?? 'Done.'`. When the model returned empty text — which it
 * does after a tool call, believing the tool result speaks for itself — a host asking a question got
 * the word "Done." with no idea what had happened or whether anything was read.
 *
 * The real figures were fine: asked for the Ranch's November revenue, the agent called its tool and
 * answered $2,319.52, matching the tool output exactly. The failure was only in what it said when the
 * model went quiet.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'functions', '_lib', 'agent', 'run-agent.ts'), 'utf8');
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('an empty model reply never becomes the word "Done."', () => {
  assert.equal(/\?\?\s*'Done\.'/.test(code), false, "the loop still substitutes 'Done.' for an empty model reply");
  assert.equal(/['"]Done\.['"]/.test(code), false, 'the word "Done." is still produced as a reply');
});

test('a silent model is described by what the tools actually did', () => {
  /*
   * The replacement names the tools that ran, so the host can tell whether anything happened. That is
   * worse prose than a real answer and far better than "Done.".
   */
  assert.match(code, /toolSteps\.map\(\(step\) => step\.tool\)/, 'the fallback does not name the tools that ran');
  assert.match(code, /returned no summary/, 'the fallback does not say the model was silent');
  assert.match(code, /Nothing was changed/, 'a run with no tools does not say nothing changed');
});

test('the no-tools case is distinguished from the tools case', () => {
  // If no tool ran, the agent must not imply it did something.
  const idx = code.indexOf('Nothing was changed');
  assert.ok(idx > 0);
  const window = code.slice(Math.max(0, idx - 260), idx + 20);
  assert.match(window, /used\.length > 0/, 'the no-tools case is not distinguished');
});

test('a real answer is still passed through untouched', () => {
  // The fix must not rewrite a genuine reply.
  assert.match(code, /reply = result\.text\?\.trim\(\) \?\? ''/, 'the model text is not read into the reply');
  assert.match(code, /if \(!reply\) \{/, 'the fallback is not conditional on the reply being empty');
});
