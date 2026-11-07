import { corsJson } from '../../_lib/data';
import { AGENT_SITE_MAP } from '../../_lib/agent/site-map';
import { botRoutePaths, PUBLIC_TOKEN_ROUTES } from '../../_lib/muse/routes';

/**
 * The map plus the documented route list. The list comes from the same registry the OpenAPI spec
 * uses, so the two cannot disagree about what exists.
 */
export const onRequestGet: PagesFunction = async ({ request }) =>
  corsJson(request, {
    ...AGENT_SITE_MAP,
    documentedRoutes: botRoutePaths(),
    publicTokenRoutes: PUBLIC_TOKEN_ROUTES,
  });

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
