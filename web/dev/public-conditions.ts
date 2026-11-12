import { buildPublicConditions } from '../functions/_lib/platform/public-conditions';

export async function devPublicConditions() {
  return buildPublicConditions(fetch);
}
