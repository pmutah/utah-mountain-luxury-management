import { downloadReceipt, type FirebaseStorageEnv } from '../../../_lib/gcs';
import { loadCustomExpenses } from '../../../_lib/expenses';
import type { SettingsEnv } from '../../../_lib/kv';

type ExpenseEnv = SettingsEnv & FirebaseStorageEnv;

export const onRequestGet: PagesFunction<ExpenseEnv> = async ({ request, env, params }) => {
  const id = params.id as string;
  if (!id) {
    return new Response(JSON.stringify({ error: 'id required' }), { status: 400 });
  }

  const custom = await loadCustomExpenses(env);
  const expense = custom.find((e) => e.id === id);
  if (!expense?.receiptStoragePath) {
    return new Response(JSON.stringify({ error: 'No receipt for this expense' }), { status: 404 });
  }

  try {
    const { bytes, contentType } = await downloadReceipt(env, expense.receiptStoragePath);
    const origin = request.headers.get('Origin') ?? '*';
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Failed to load receipt' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

export const onRequestOptions: PagesFunction = async ({ request }) => {
  const origin = request.headers.get('Origin') ?? '*';
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Credentials': 'true',
    },
  });
};
