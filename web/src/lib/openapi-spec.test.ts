/**
 * The OpenAPI spec is what a standards-following agent reads to discover routes. It used to declare
 * two paths while the API had dozens, so every route built this session was invisible to any client
 * that trusted the spec.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { museUmlOpenApiSpec } from '../../functions/_lib/muse/openapi.ts';
import { PUBLIC_TOKEN_ROUTES, botRoutePaths, botRoutes } from '../../functions/_lib/muse/routes.ts';

const spec = museUmlOpenApiSpec();
const paths = Object.keys(spec.paths as Record<string, unknown>);

test('the spec declares every documented bot route', () => {
  for (const path of botRoutePaths()) {
    assert.ok(paths.includes(path), `OpenAPI does not declare ${path}`);
  }
});

test('the spec declares the token-in-the-path routes as public', () => {
  const doc = spec.paths as Record<string, { get?: { security?: unknown[] } }>;
  for (const path of PUBLIC_TOKEN_ROUTES) {
    assert.ok(paths.includes(path), `OpenAPI does not declare ${path}`);
    assert.deepEqual(doc[path]?.get?.security, [], `${path} is not marked public`);
  }
});

test('a write route advertises the refusals a caller will hit', () => {
  const doc = spec.paths as Record<string, { post?: { responses?: Record<string, unknown> } }>;
  const accept = doc['/api/book/accept']?.post?.responses ?? {};
  assert.ok('409' in accept, 'accept does not document its refusal');
  assert.ok('503' in accept, 'accept does not document a paused store');
});

test('a read route does not advertise a write status', () => {
  const doc = spec.paths as Record<string, { get?: { responses?: Record<string, unknown> } }>;
  const metrics = doc['/api/portfolio/metrics']?.get?.responses ?? {};
  assert.equal('201' in metrics, false);
  assert.ok('401' in metrics);
});

test('the push plan says it cannot send', () => {
  const doc = spec.paths as Record<string, { get?: { description?: string } }>;
  const plan = doc['/api/pricing/push-plan']?.get;
  assert.ok(plan);
  assert.match(plan.description ?? '', /no writer/);
  const listed = (spec as unknown as { 'x-uml-documented-routes': string[] })['x-uml-documented-routes'];
  assert.ok(listed.includes('GET /api/pricing/push-plan'));
});

test('the guest guide says the way in is blanked for an unsigned caller', () => {
  const doc = spec.paths as Record<string, { get?: { description?: string } }>;
  assert.match(doc['/api/guest-guide']?.get?.description ?? '', /blanked/);
});

test('every route in the registry has an operation id and a summary', () => {
  for (const route of botRoutes()) {
    assert.ok(route.operationId.length > 0, `${route.method} ${route.path} has no operationId`);
    assert.ok(route.summary.length > 0, `${route.method} ${route.path} has no summary`);
    assert.equal(route.operationId.includes(' '), false, `${route.operationId} has a space`);
  }
});

test('the spec never carries a secret', () => {
  const text = JSON.stringify(spec);
  assert.equal(/fixture-wifi-secret-not-real/.test(text), false);
  assert.equal(/\bMUSE_BOT_SECRET=[A-Za-z0-9]/.test(text), false);
});

test('the map and the spec agree on what exists', async () => {
  const map = (await import('../../functions/api/agent/map.ts')) as unknown as Record<
    string,
    (ctx: { request: Request; env: unknown; params: Record<string, string> }) => Promise<Response>
  >;
  const res = await map.onRequestGet!({
    request: new Request('https://x/api/agent/map'),
    env: {},
    params: {},
  });
  const body = (await res.json()) as { documentedRoutes: string[]; publicTokenRoutes: string[] };
  assert.deepEqual(body.documentedRoutes, botRoutePaths());
  assert.deepEqual(body.publicTokenRoutes, PUBLIC_TOKEN_ROUTES);
  // The map names every path the spec declares.
  for (const path of body.documentedRoutes) {
    assert.ok(paths.includes(path), `the map lists ${path} but the spec does not`);
  }
});

test('the two original tool paths are still there', () => {
  assert.ok(paths.includes('/api/muse/instructions'));
  assert.ok(paths.includes('/api/muse/tools'));
});
