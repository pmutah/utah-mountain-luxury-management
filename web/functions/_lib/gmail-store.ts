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
  if (!res.ok) {
    /*
     * The bare message was the whole problem: `Failed to refresh Gmail token` says nothing about *why*,
     * and the two causes need opposite fixes.
     *
     *   `invalid_grant`  — the refresh token was revoked or expired. The mailbox has to be reconnected.
     *   `invalid_client` — the client id/secret do not match the token. On 2026-11-08 the OAuth client id
     *                      was changed because the old one did not exist in any project, which strands
     *                      every token minted before that change.
     *
     * Google's own `error` and `error_description` are surfaced, because guessing between those two
     * wastes exactly the kind of time this did.
     */
    const raw = await res.text().catch(() => '');
    let detail = raw.slice(0, 200);
    try {
      const parsed = JSON.parse(raw) as { error?: string; error_description?: string };
      detail = [parsed.error, parsed.error_description].filter(Boolean).join(': ') || detail;
    } catch {
      // A non-JSON error body is still worth showing.
    }
    const hint =
      /invalid_grant/.test(raw)
        ? ' The mailbox needs reconnecting — the refresh token is no longer valid.'
        : /invalid_client/.test(raw)
          ? ' The OAuth client id or secret does not match this token. Reconnect the mailbox so it mints a token for the current client.'
          : '';
    throw new Error(`Failed to refresh Gmail token (${res.status})${detail ? `: ${detail}` : ''}.${hint}`);
  }
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

/**
 * Whether this deployment can actually send mail, and why not when it cannot.
 *
 * Two routes report mailbox state — `/api/integrations/gmail/status` and `/api/surveys` — and both used
 * to answer `connected` from the presence of an email string. That is not a working mailbox: on
 * 2026-11-08 the dashboard read "Gmail: pmutah@gmail.com, connected" while every send failed with
 * `invalid_client`, so guest requests arrived with no email and nothing on screen said why.
 *
 * One function, used by both, calling the same token path a real send takes — so the report cannot
 * disagree with reality.
 */
export async function gmailHealth(
  env: SettingsEnv,
  tokens: GmailTokens | null,
): Promise<{ connected: boolean; email: string | null; problem: string | null; oauthConfigured: boolean }> {
  const oauthConfigured = Boolean(env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim());
  const email = tokens?.email ?? null;
  if (!email) {
    return { connected: false, email: null, problem: 'No mailbox is connected.', oauthConfigured };
  }
  try {
    const valid = await getValidGmailToken(env);
    if (valid?.accessToken) return { connected: true, email, problem: null, oauthConfigured };
    return { connected: false, email, problem: 'The mailbox has no refresh token, so mail cannot be sent.', oauthConfigured };
  } catch (err) {
    return {
      connected: false,
      email,
      problem: err instanceof Error ? err.message : 'The mailbox could not be reached.',
      oauthConfigured,
    };
  }
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
  const ids = json.messages?.map((message) => message.id).filter(Boolean) ?? [];
  const messages: unknown[] = [];
  for (const id of ids) {
    const detail = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    if (!detail.ok) continue;
    const message = (await detail.json()) as {
      id?: string;
      snippet?: string;
      payload?: { headers?: Array<{ name?: string; value?: string }> };
    };
    messages.push({
      id: message.id ?? id,
      from: headerValue(message.payload?.headers, 'From'),
      subject: headerValue(message.payload?.headers, 'Subject'),
      date: headerValue(message.payload?.headers, 'Date'),
      snippet: message.snippet ?? '',
    });
  }
  return messages;
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
  /*
   * This function must never throw.
   *
   * Its contract is already `{ id } | { error }`, and six of the nine call sites treat a throw as an
   * error object — but `getValidGmailToken` **throws** when the refresh fails, and that escaped. On
   * 2026-11-08 it did: a booking request was saved, then `Failed to refresh Gmail token` threw out of
   * here and Cloudflare answered the guest with a 500 crash page for a request that had gone through.
   *
   * Four other callers (`surveys/send`, `stay-message`, `automation`, `esign/send-session`) had no guard
   * at all, so the same fault would have destroyed their responses too — including an e-signature send
   * that has already written its session and a nightly automation that has already done its work.
   *
   * Every caller now gets the error back as data, which is what its signature always promised.
   */
  let tokens;
  try {
    tokens = await getValidGmailToken(env);
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'The mailbox could not be reached.' };
  }
  if (!tokens) {
    /*
     * This said "Connect utahmountainluxury@gmail.com in the dashboard" — a hardcoded address this deployment does not use.
     * Verified on production 2026-11-10: the connected mailbox is `pmutah@gmail.com`, so a host following the old line would
     * sign out and back in as an address the app never reads, and the send would fail again.
     *
     * The stored tokens are the only place the app learns which mailbox is connected (`tokens.email`, read from Google's
     * profile). With no tokens there is no address to name, so the honest instruction is to connect *a* mailbox rather than a
     * particular one - naming a guessed address is how the old line went wrong.
     */
    return {
      error:
        'Gmail is not connected. Open the dashboard and connect the guest mailbox there, so guest confirmations and host alerts can send.',
    };
  }

  const raw = btoa(
    `To: ${to}\r\nFrom: Utah Mountain Luxury <${tokens.email}>\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`,
  )
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  let res: Response;
  try {
    res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokens.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });
  } catch (err) {
    // A network fault is a failed send, not a crash for whoever asked for the mail.
    return { error: err instanceof Error ? err.message : 'Gmail could not be reached.' };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    return { error: `Gmail send failed (${res.status})${detail ? `: ${detail.slice(0, 180)}` : ''}` };
  }
  const json = (await res.json()) as { id?: string };
  return { id: json.id };
}

export type GmailHeaderMessage = {
  id: string;
  subject: string;
  from: string;
  date: string;
};

export type GmailInvoiceSource = {
  id: string;
  subject: string;
  from: string;
  date: string;
  text: string;
  attachment?: { filename: string; mimeType: string; data: string };
};

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
};

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string): string {
  const want = name.toLowerCase();
  return headers?.find((h) => (h.name ?? '').toLowerCase() === want)?.value?.trim() ?? '';
}

function decodeB64Url(data: string): Uint8Array {
  const pad = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = pad + '='.repeat((4 - (pad.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeB64UrlText(data: string): string {
  return new TextDecoder().decode(decodeB64Url(data));
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function walkParts(
  part: GmailPart | undefined,
  acc: { plain: string[]; html: string[]; attachments: Array<{ filename: string; mimeType: string; attachmentId: string }> },
): void {
  if (!part) return;
  const mime = (part.mimeType ?? '').toLowerCase();
  const filename = part.filename?.trim() ?? '';
  if (filename && part.body?.attachmentId) {
    const ok =
      mime === 'application/pdf' ||
      mime.startsWith('image/') ||
      filename.toLowerCase().endsWith('.pdf');
    if (ok) {
      acc.attachments.push({
        filename,
        mimeType: mime.startsWith('image/') ? mime : 'application/pdf',
        attachmentId: part.body.attachmentId,
      });
    }
  }
  if (part.body?.data) {
    if (mime === 'text/plain') acc.plain.push(decodeB64UrlText(part.body.data));
    if (mime === 'text/html') acc.html.push(htmlToText(decodeB64UrlText(part.body.data)));
  }
  for (const child of part.parts ?? []) walkParts(child, acc);
}

export async function gmailSearchHeaders(
  env: SettingsEnv,
  query: string,
  max = 8,
): Promise<GmailHeaderMessage[]> {
  const tokens = await getValidGmailToken(env);
  if (!tokens) throw new Error('Gmail is not connected.');

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${max}`,
    { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
  );
  if (!listRes.ok) throw new Error(`Gmail search failed (${listRes.status})`);
  const listed = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = listed.messages?.map((m) => m.id).filter(Boolean) ?? [];
  const messages: GmailHeaderMessage[] = [];

  for (const id of ids) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    if (!res.ok) continue;
    const json = (await res.json()) as {
      id?: string;
      payload?: { headers?: Array<{ name?: string; value?: string }> };
    };
    messages.push({
      id: json.id ?? id,
      subject: headerValue(json.payload?.headers, 'Subject') || '(no subject)',
      from: headerValue(json.payload?.headers, 'From'),
      date: headerValue(json.payload?.headers, 'Date'),
    });
  }
  return messages;
}

export async function gmailGetInvoiceSource(env: SettingsEnv, messageId: string): Promise<GmailInvoiceSource> {
  const tokens = await getValidGmailToken(env);
  if (!tokens) throw new Error('Gmail is not connected.');

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
    { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
  );
  if (!res.ok) throw new Error(`Could not open that email (${res.status})`);
  const json = (await res.json()) as {
    id?: string;
    payload?: GmailPart & { headers?: Array<{ name?: string; value?: string }> };
  };

  const acc = {
    plain: [] as string[],
    html: [] as string[],
    attachments: [] as Array<{ filename: string; mimeType: string; attachmentId: string }>,
  };
  walkParts(json.payload, acc);
  const text = (acc.plain.join('\n\n') || acc.html.join('\n\n')).trim();
  const first = acc.attachments[0];
  let attachment: GmailInvoiceSource['attachment'];

  if (first) {
    const attRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(first.attachmentId)}`,
      { headers: { Authorization: `Bearer ${tokens.accessToken}` } },
    );
    if (attRes.ok) {
      const att = (await attRes.json()) as { data?: string; size?: number };
      if (att.data && (att.size ?? att.data.length) < 8_000_000) {
        const bytes = decodeB64Url(att.data);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        attachment = {
          filename: first.filename,
          mimeType: first.mimeType,
          data: btoa(binary),
        };
      }
    }
  }

  const headers = json.payload?.headers;
  const subject = headerValue(headers, 'Subject');
  const from = headerValue(headers, 'From');
  const date = headerValue(headers, 'Date');
  const headerBlock = [`Subject: ${subject}`, `From: ${from}`, `Date: ${date}`].join('\n');

  return {
    id: json.id ?? messageId,
    subject: subject || '(no subject)',
    from,
    date,
    text: `${headerBlock}\n\n${text}`.trim(),
    attachment,
  };
}
