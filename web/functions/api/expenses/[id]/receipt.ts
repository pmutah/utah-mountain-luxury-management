import { hostDenied, hostOnly } from '../../../_lib/auth';
import { corsHeaders } from '../../../_lib/data';
import { loadCustomExpenses } from '../../../_lib/expenses';
import { loadStoredReceipt } from '../../../_lib/receipt-store';
import { readOrRefuse } from '../../../_lib/read-guard';
import type { FirebaseStorageEnv } from '../../../_lib/gcs';
import type { SettingsEnv } from '../../../_lib/kv';

type ExpenseEnv = SettingsEnv & FirebaseStorageEnv;

export const onRequestGet: PagesFunction<ExpenseEnv> = async ({ request, env, params }) => {
  if (!hostOnly(request, env)) return hostDenied(request, env);
  const id = params.id as string;
  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  }

  const read = await readOrRefuse(request, () => loadCustomExpenses(env), 'Saved expenses');
  if (!read.ok) return read.response;
  const expense = read.value.find((e) => e.id === id);
  if (!expense?.receiptStoragePath) {
    return new Response(JSON.stringify({ error: 'No receipt for this expense' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { bytes, contentType } = await loadStoredReceipt(env, expense);
    const isPdf = contentType === 'application/pdf';
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'private, max-age=3600',
      ...corsHeaders(request),
    };
    if (isPdf) {
      headers['Content-Disposition'] = `inline; filename="bill-${id}.pdf"`;
    }
    return new Response(bytes, { status: 200, headers });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Failed to load receipt' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      ...corsHeaders(request),
    },
  });
};
