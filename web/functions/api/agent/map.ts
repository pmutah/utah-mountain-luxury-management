import { corsJson } from '../../_lib/data';
import { AGENT_SITE_MAP } from '../../_lib/agent/site-map';

export const onRequestGet: PagesFunction = async ({ request }) =>
  corsJson(request, AGENT_SITE_MAP);

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
