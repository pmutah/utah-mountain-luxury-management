import { kvGet, kvPut, newId } from '../kv-json';
import type { SettingsEnv } from '../kv';
import type { AgentMessage } from './types';

const KV_SESSIONS = 'agentSessions';
const MAX_MESSAGES = 40;

type SessionStore = Record<string, AgentMessage[]>;

export function newSessionId(): string {
  return newId('sess');
}

export async function loadSession(env: SettingsEnv, sessionId: string): Promise<AgentMessage[]> {
  const all = await kvGet<SessionStore>(env, KV_SESSIONS, {});
  return all[sessionId] ?? [];
}

export async function saveSession(
  env: SettingsEnv,
  sessionId: string,
  messages: AgentMessage[],
): Promise<void> {
  const all = await kvGet<SessionStore>(env, KV_SESSIONS, {});
  all[sessionId] = messages.slice(-MAX_MESSAGES);
  const keys = Object.keys(all);
  if (keys.length > 50) {
    delete all[keys[0]!];
  }
  await kvPut(env, KV_SESSIONS, all);
}
