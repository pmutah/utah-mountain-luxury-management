import type { SettingsEnv } from './kv';

export function twilioFromNumber(env: SettingsEnv): string | null {
  const from = env.UML_TWILIO_SMS_FROM?.trim() || env.TWILIO_SMS_FROM?.trim();
  return from || null;
}

export function isTwilioConfigured(env: SettingsEnv): boolean {
  return Boolean(env.TWILIO_ACCOUNT_SID?.trim() && env.TWILIO_AUTH_TOKEN?.trim() && twilioFromNumber(env));
}

function digitsPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (raw.trim().startsWith('+') && digits.length >= 10) return `+${digits}`;
  return raw.trim();
}

export async function sendTwilioSms(
  env: SettingsEnv,
  to: string,
  body: string,
): Promise<{ sid?: string; error?: string }> {
  const sid = env.TWILIO_ACCOUNT_SID?.trim();
  const token = env.TWILIO_AUTH_TOKEN?.trim();
  const from = twilioFromNumber(env);
  if (!sid || !token || !from) {
    return { error: 'Twilio is not configured on this dashboard (SID, token, and From number).' };
  }

  const params = new URLSearchParams({
    To: digitsPhone(to),
    From: from,
    Body: body.slice(0, 1600),
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${sid}:${token}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });

  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
  if (!res.ok) {
    return { error: json.message || `Twilio send failed (${res.status})` };
  }
  return { sid: json.sid };
}
