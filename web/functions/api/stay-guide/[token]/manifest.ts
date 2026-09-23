import { PROPERTIES } from '../../../_lib/data';
import { findSurveyByToken } from '../../../_lib/survey-store';
import type { AgentEnv } from '../../../_lib/agent/types';

export const onRequestGet: PagesFunction<AgentEnv> = async ({ env, params }) => {
  const token = String(params.token ?? '');
  const survey = await findSurveyByToken(env, token);
  if (!survey) return new Response('Not found', { status: 404 });
  const house = PROPERTIES[survey.propertyId]?.name.replace(/^The /, '') ?? 'Your stay';
  const start = `/stay/${encodeURIComponent(token)}`;
  return new Response(
    JSON.stringify({
      name: `${house} · Utah Mountain Luxury`,
      short_name: house.replace(/ House$/, ''),
      description: 'Your stay guide: door code, Wi-Fi, the house, and the area.',
      start_url: start,
      scope: start,
      display: 'standalone',
      background_color: '#07110f',
      theme_color: '#07110f',
      icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
    }),
    { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
};
