import { museUmlInstructions } from '../../_lib/muse/instructions';
import { corsHeaders } from '../../_lib/data';

export const onRequestGet: PagesFunction = async ({ request }) =>
  new Response(museUmlInstructions(), {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-muse-bot-secret',
      ...corsHeaders(request),
    },
  });

export const onRequestOptions: PagesFunction = async ({ request }) =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-muse-bot-secret',
      ...corsHeaders(request),
    },
  });
