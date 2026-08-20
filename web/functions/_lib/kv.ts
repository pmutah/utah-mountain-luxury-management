import { DEFAULT_EXTRA_CLEANING } from './data';

const KEY = 'extraCleaningFees';

export interface SettingsEnv {
  SETTINGS?: KVNamespace;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  UML_TWILIO_SMS_FROM?: string;
  TWILIO_SMS_FROM?: string;
}

export async function loadExtraCleaningFees(env: SettingsEnv): Promise<Record<string, number>> {
  if (!env.SETTINGS) return { ...DEFAULT_EXTRA_CLEANING };
  try {
    const raw = await env.SETTINGS.get(KEY);
    if (!raw) return { ...DEFAULT_EXTRA_CLEANING };
    return { ...DEFAULT_EXTRA_CLEANING, ...(JSON.parse(raw) as Record<string, number>) };
  } catch {
    return { ...DEFAULT_EXTRA_CLEANING };
  }
}

export async function saveExtraCleaningFees(
  env: SettingsEnv,
  fees: Record<string, number>,
): Promise<Record<string, number>> {
  if (env.SETTINGS) {
    await env.SETTINGS.put(KEY, JSON.stringify(fees));
  }
  return fees;
}
