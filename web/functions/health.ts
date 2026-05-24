import { corsJson } from './_lib/data';

export const onRequestGet: PagesFunction = async ({ request }) =>
  corsJson(request, { status: 'ok' });
