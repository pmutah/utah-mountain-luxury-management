import { kvGet, kvPut } from './kv-json';
import type { SettingsEnv } from './kv';
import type { GmailTokens } from './agent/types';

const KV_GMAIL = 'gmailTokens';

export async function loadGmailTokens(env: SettingsEnv): Promise<GmailTokens | null> {
  return kvGet<GmailTokens | null>(env, KV_GMAIL, null);
}

export async function saveGmailTokens(env: SettingsEnv, tokens: GmailTokens): Promise<GmailTokens> {
  return kvPut(env, KV_GMAIL, tokens);
}

export async function clearGmailTokens(env: SettingsEnv): Promise<void> {
  if (env.SETTINGS) await env.SETTINGS.delete(KV_GMAIL);
}

export function gmailOAuthUrl(env: SettingsEnv, redirectUri: string): string | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) return null;
  const scopes = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.send',
  ].join(' ');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes,
    access_type: 'offline',
    prompt: 'consent',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGmailCode(
  env: SettingsEnv,
  code: string,
  redirectUri: string,
): Promise<GmailTokens> {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Gmail OAuth not configured');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error('OAuth token exchange failed');
  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = profileRes.ok
    ? ((await profileRes.json()) as { emailAddress?: string })
    : { emailAddress: 'connected@gmail.com' };

  const existing = await loadGmailTokens(env);
  const tokens: GmailTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? existing?.refreshToken ?? '',
    expiry: Date.now() + data.expires_in * 1000,
    email: profile.emailAddress ?? 'connected@gmail.com',
  };
  await saveGmailTokens(env, tokens);
  return tokens;
}

async function refreshAccessToken(env: SettingsEnv, tokens: GmailTokens): Promise<GmailTokens> {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID!.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET!.trim();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) throw new Error('Failed to refresh Gmail token');
  const data = (await res.json()) as { access_token: string; expires_in: number };
  const updated = {
    ...tokens,
    accessToken: data.access_token,
    expiry: Date.now() + data.expires_in * 1000,
  };
  await saveGmailTokens(env, updated);
  return updated;
}

export async function getValidGmailToken(env: SettingsEnv): Promise<GmailTokens | null> {
  let tokens = await loadGmailTokens(env);
  if (!tokens?.refreshToken) return null;
  if (Date.now() > tokens.expiry - 60000) {
    tokens = await refreshAccessToken(env, tokens);
  }
  return tokens;
}

export async function gmailSearch(env: SettingsEnv, query: string, max = 5): Promise<unknown[]> {
  const tokens = await getValidGmailToken(env);
  if (!tokens) return [{ error: 'Gmail not connected. Use Settings to connect.' }];

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
    { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
  );
  if (!res.ok) return [{ error: `Gmail search failed: ${res.status}` }];
  const json = (await res.json()) as { messages?: Array<{ id: string }> };
  return json.messages ?? [];
}

export async function gmailCreateDraft(
  env: SettingsEnv,
  to: string,
  subject: string,
  body: string,
): Promise<{ draftId?: string; error?: string }> {
  const tokens = await getValidGmailToken(env);
  if (!tokens) return { error: 'Gmail not connected' };

  const raw = btoa(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: { raw } }),
  });
  if (!res.ok) return { error: `Draft failed: ${res.status}` };
  const json = (await res.json()) as { id?: string };
  return { draftId: json.id };
}

export async function gmailSend(
  env: SettingsEnv,
  to: string,
  subject: string,
  body: string,
): Promise<{ id?: string; error?: string }> {
  const tokens = await getValidGmailToken(env);
  if (!tokens) return { error: 'Gmail is not connected. Connect utahmountainluxury@gmail.com in the dashboard.' };

  const raw = btoa(
    `To: ${to}\r\nFrom: Utah Mountain Luxury <${tokens.email}>\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { error: `Gmail send failed (${res.status})${detail ? `: ${detail.slice(0, 180)}` : ''}` };
  }
  const json = (await res.json()) as { id?: string };
  return { id: json.id };
}
