import { museUmlInstructions } from '../../_lib/muse/instructions';

export const onRequestGet: PagesFunction = async ({ request }) =>
  new Response(museUmlInstructions(), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-muse-bot-secret',
    },
  });

export const onRequestOptions: PagesFunction = async ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': request.headers.get('Origin') ?? '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-muse-bot-secret',
    },
  });
