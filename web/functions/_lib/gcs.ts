/** Google Cloud Storage helpers for Firebase Storage (Workers-compatible). */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

export interface FirebaseStorageEnv {
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_STORAGE_BUCKET?: string;
}

const STORAGE_SCOPE = 'https://www.googleapis.com/auth/devstorage.read_write';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export const RECEIPT_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

export function parseServiceAccount(env: FirebaseStorageEnv): ServiceAccount | null {
  const raw = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    return null;
  }
}

export function storageBucket(env: FirebaseStorageEnv): string {
  const explicit = env.FIREBASE_STORAGE_BUCKET?.trim();
  if (explicit) return explicit;
  const project = env.FIREBASE_PROJECT_ID?.trim() || 'wilhite-portfolio';
  return `${project}.appspot.com`;
}

export function receiptExtension(contentType: string): string {
  switch (contentType) {
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'jpg';
  }
}

export function receiptStoragePath(
  propertyId: string,
  expenseId: string,
  contentType: string,
): string {
  return `receipts/${propertyId}/${expenseId}.${receiptExtension(contentType)}`;
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const binary = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8',
    binary,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function signJwt(sa: ServiceAccount, payload: Record<string, unknown>): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' };
  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(payload)));
  const unsigned = `${headerB64}.${payloadB64}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    enc.encode(unsigned),
  );
  return `${unsigned}.${base64UrlEncode(sig)}`;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt > now + 60) {
    return cachedToken.token;
  }
  const jwt = await signJwt(sa, {
    iss: sa.client_email,
    scope: STORAGE_SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now,
  });
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to get GCS access token: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in };
  return data.access_token;
}

export function storageConfigured(env: FirebaseStorageEnv): boolean {
  return parseServiceAccount(env) !== null;
}

export async function uploadStorageObject(
  env: FirebaseStorageEnv,
  storagePath: string,
  bytes: Uint8Array,
  contentType: string,
  maxBytes: number,
): Promise<void> {
  if (bytes.length > maxBytes) {
    const mb = Math.floor(maxBytes / (1024 * 1024));
    throw new Error(`File must be ${mb} MB or smaller`);
  }
  const sa = parseServiceAccount(env);
  if (!sa) throw new Error('Firebase Storage not configured (set FIREBASE_SERVICE_ACCOUNT_JSON)');
  const token = await getAccessToken(sa);
  const bucket = storageBucket(env);
  const url = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(storagePath)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': contentType,
    },
    body: bytes,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Storage upload failed: ${res.status} ${detail.slice(0, 200)}`);
  }
}

export async function uploadReceipt(
  env: FirebaseStorageEnv,
  storagePath: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  return uploadStorageObject(env, storagePath, bytes, contentType, RECEIPT_MAX_BYTES);
}

export async function downloadReceipt(
  env: FirebaseStorageEnv,
  storagePath: string,
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const sa = parseServiceAccount(env);
  if (!sa) throw new Error('Firebase Storage not configured');
  const token = await getAccessToken(sa);
  const bucket = storageBucket(env);
  const metaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}`;
  const metaRes = await fetch(metaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!metaRes.ok) throw new Error('Receipt not found');
  const meta = (await metaRes.json()) as { contentType?: string };
  const mediaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}?alt=media`;
  const res = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Failed to load receipt');
  return {
    bytes: await res.arrayBuffer(),
    contentType: meta.contentType || 'application/octet-stream',
  };
}

export async function deleteReceipt(env: FirebaseStorageEnv, storagePath: string): Promise<void> {
  const sa = parseServiceAccount(env);
  if (!sa) return;
  const token = await getAccessToken(sa);
  const bucket = storageBucket(env);
  const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(storagePath)}`;
  await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

export function decodeBase64Receipt(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
