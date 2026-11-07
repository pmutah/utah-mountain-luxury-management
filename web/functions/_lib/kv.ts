import { DEFAULT_EXTRA_CLEANING } from './data';
import { StorageReadError, storageReadPaused } from './kv-json';
import { cachedGet } from './request-cache';

const KEY = 'extraCleaningFees';

export interface SettingsEnv {
  SETTINGS?: KVNamespace;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  UML_TWILIO_SMS_FROM?: string;
  TWILIO_SMS_FROM?: string;
  SURVEY_NOTIFY_EMAILS?: string;
}

/**
 * Extra cleaning fees.
 *
 * This used to swallow every error and return the defaults, so a store at its read limit silently
 * reverted the fees and nothing on the page said so. A read failure is now raised when it is a limit
 * or pause, so the caller can refuse rather than quietly report the wrong money; a malformed value
 * still falls back, because that is a data problem and the defaults are the safe answer.
 */
export async function loadExtraCleaningFees(env: SettingsEnv): Promise<Record<string, number>> {
  if (!env.SETTINGS) return { ...DEFAULT_EXTRA_CLEANING };
  // Cached per request: the metrics and history routes both read this on one dashboard load.
  return cachedGet(
    env,
    async () => {
      try {
        const raw = await env.SETTINGS!.get(KEY);
        if (!raw) return { ...DEFAULT_EXTRA_CLEANING };
        return { ...DEFAULT_EXTRA_CLEANING, ...(JSON.parse(raw) as Record<string, number>) };
      } catch (err) {
        if (storageReadPaused(err)) throw err instanceof StorageReadError ? err : new StorageReadError();
        return { ...DEFAULT_EXTRA_CLEANING };
      }
    },
    `kv:${KEY}`,
  );
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
