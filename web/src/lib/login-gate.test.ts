/**
 * The login screen must not offer a way in that cannot work.
 *
 * `DASHBOARD_PASSWORD` was never set on this deployment, yet the gate rendered the password form
 * unconditionally. So the live site showed a password box on a page where no password existed — you
 * typed one, it failed, and nothing said why. The email allowlist was the only real way in, and the
 * screen did not say so.
 *
 * The gate now asks the server what sign-in methods exist and renders only those. These tests read the
 * component, because the failure was in what it rendered rather than in a function it called.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const source = readFileSync(join(process.cwd(), 'src', 'components', 'LoginGate.tsx'), 'utf8');

/** The component with comments stripped, so prose about a control cannot satisfy a check for it. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test('the password form is only rendered when a password exists', () => {
  const form = code.indexOf('<form onSubmit');
  assert.ok(form > 0, 'the login gate has no form');
  /*
   * The guard has to sit immediately before the form. Comments were stripped above, which leaves an
   * empty `{}` where a JSX comment was, so whitespace and that artifact are normalised away first.
   */
  const before = code
    .slice(0, form)
    .replace(/\{\s*\}/g, '')
    .replace(/\s+/g, ' ');
  assert.match(
    before.slice(-80).trimEnd(),
    /\{passwordSignIn && \($/,
    `the form is not guarded by passwordSignIn; it is preceded by ...${before.slice(-80)}`,
  );
});

test('the gate reads whether a password exists instead of assuming one', () => {
  assert.match(code, /getLoginOptions\(/, 'the gate never asks what sign-in methods exist');
  assert.match(code, /setPasswordSignIn\(/, 'the gate ignores the password availability it was told about');
});

test('the Google fallback does not point at a password that is not there', () => {
  /*
   * This is the message somebody sees when Google's script fails. It said "use the dashboard password
   * below" on a deployment with no password — sending them to a field that could not work.
   */
  const idx = code.indexOf('Google sign-in could not load');
  assert.ok(idx > 0, 'the Google fallback message is gone');
  const window = code.slice(idx - 200, idx + 300);
  assert.match(window, /passwordSignIn/, 'the fallback text does not depend on whether a password exists');
  assert.match(window, /Try again in a moment/, 'there is no fallback advice for a deployment with no password');
});

test('a deployment with no sign-in at all says so rather than showing an empty form', () => {
  assert.match(code, /login-nothing-configured/, 'nothing tells the visitor that no sign-in is configured');
  assert.match(code, /stays closed/, 'the closed state is not explained');
});

test('an error from a Google attempt still has somewhere to appear', () => {
  // With no password form, the error would otherwise be swallowed and the click would look ignored.
  assert.match(
    code,
    /emailSignIn && !passwordSignIn && error/,
    'a failed Google sign-in shows no message when there is no password form',
  );
});
