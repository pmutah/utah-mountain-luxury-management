import { extraCleaningFees, corsJson } from '../../_lib/data';

export const onRequestPut: PagesFunction = async ({ request }) => {
  const body = (await request.json()) as Record<string, number | string>;
  for (const [key, val] of Object.entries(body)) {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) delete extraCleaningFees[key];
    else extraCleaningFees[key] = num;
  }
  return corsJson(request, extraCleaningFees);
};

export const onRequestOptions: PagesFunction = async ({ request }) => corsJson(request, null, 204);
