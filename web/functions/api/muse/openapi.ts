import { corsJson } from '../../_lib/data';
import { museUmlOpenApiSpec } from '../../_lib/muse/openapi';

export const onRequestGet: PagesFunction = async ({ request }) =>
  corsJson(request, museUmlOpenApiSpec());

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
