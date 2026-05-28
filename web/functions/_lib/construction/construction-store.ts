import { kvGet, kvPut, newId } from '../kv-json';
import type { SettingsEnv } from '../kv';
import { DEFAULT_CONSTRUCTION_STAGES } from './types';
import type {
  ConstructionDecision,
  ConstructionDocument,
  ConstructionProject,
  ConstructionRecommendation,
  ConstructionAgentMessage,
} from './types';

const KV_PROJECT = 'constructionProject';
const KV_DOCS = 'constructionDocuments';
const KV_DECISIONS = 'constructionDecisions';
const KV_RECOMMENDATIONS = 'constructionRecommendations';
const KV_SESSIONS = 'constructionAgentSessions';

const DEFAULT_PROJECT: ConstructionProject = {
  id: 'construction',
  name: 'Construction Project',
  address: 'Lindon, Utah 84042',
  jurisdiction: 'Utah County / Lindon',
  currentStage: 'Planning',
  stages: [...DEFAULT_CONSTRUCTION_STAGES],
  budgetTarget: 0,
  scopeNotes: '',
  projectType: 'SFH',
  contacts: [],
  updatedAt: new Date().toISOString(),
};

export async function loadConstructionProject(env: SettingsEnv): Promise<ConstructionProject> {
  return kvGet(env, KV_PROJECT, DEFAULT_PROJECT);
}

export async function saveConstructionProject(
  env: SettingsEnv,
  project: ConstructionProject,
): Promise<ConstructionProject> {
  const next = { ...project, updatedAt: new Date().toISOString() };
  return kvPut(env, KV_PROJECT, next);
}

export async function loadConstructionDocuments(env: SettingsEnv): Promise<ConstructionDocument[]> {
  return kvGet(env, KV_DOCS, []);
}

export async function saveConstructionDocuments(
  env: SettingsEnv,
  docs: ConstructionDocument[],
): Promise<ConstructionDocument[]> {
  return kvPut(env, KV_DOCS, docs);
}

export async function addConstructionDocument(
  env: SettingsEnv,
  doc: ConstructionDocument,
): Promise<ConstructionDocument> {
  const list = await loadConstructionDocuments(env);
  list.push(doc);
  await saveConstructionDocuments(env, list);
  return doc;
}

export async function getConstructionDocument(
  env: SettingsEnv,
  id: string,
): Promise<ConstructionDocument | null> {
  const list = await loadConstructionDocuments(env);
  return list.find((d) => d.id === id) ?? null;
}

export async function deleteConstructionDocumentRecord(
  env: SettingsEnv,
  id: string,
): Promise<ConstructionDocument | null> {
  const list = await loadConstructionDocuments(env);
  const doc = list.find((d) => d.id === id) ?? null;
  const next = list.filter((d) => d.id !== id);
  await saveConstructionDocuments(env, next);
  return doc;
}

export async function loadConstructionDecisions(env: SettingsEnv): Promise<ConstructionDecision[]> {
  return kvGet(env, KV_DECISIONS, []);
}

export async function addConstructionDecision(
  env: SettingsEnv,
  input: Omit<ConstructionDecision, 'id'>,
): Promise<ConstructionDecision> {
  const item: ConstructionDecision = { ...input, id: newId('dec') };
  const list = await loadConstructionDecisions(env);
  list.push(item);
  await kvPut(env, KV_DECISIONS, list);
  return item;
}

export async function loadConstructionRecommendations(
  env: SettingsEnv,
): Promise<ConstructionRecommendation[]> {
  return kvGet(env, KV_RECOMMENDATIONS, []);
}

export async function addConstructionRecommendation(
  env: SettingsEnv,
  input: Omit<ConstructionRecommendation, 'id' | 'createdAt' | 'dismissed'>,
): Promise<ConstructionRecommendation> {
  const item: ConstructionRecommendation = {
    ...input,
    id: newId('rec'),
    createdAt: new Date().toISOString(),
    dismissed: false,
  };
  const list = await loadConstructionRecommendations(env);
  list.push(item);
  await kvPut(env, KV_RECOMMENDATIONS, list.slice(-100));
  return item;
}

export async function dismissConstructionRecommendation(
  env: SettingsEnv,
  id: string,
): Promise<boolean> {
  const list = await loadConstructionRecommendations(env);
  const idx = list.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  list[idx] = { ...list[idx]!, dismissed: true };
  await kvPut(env, KV_RECOMMENDATIONS, list);
  return true;
}

export function sumInvoicedAmount(docs: ConstructionDocument[]): number {
  return docs
    .filter((d) => d.type === 'invoice' && d.amount)
    .reduce((s, d) => s + (d.amount ?? 0), 0);
}

export function newConstructionDocId(): string {
  return newId('cdoc');
}

type SessionStore = Record<string, ConstructionAgentMessage[]>;

export function newConstructionSessionId(): string {
  return newId('csess');
}

export async function loadConstructionSession(
  env: SettingsEnv,
  sessionId: string,
): Promise<ConstructionAgentMessage[]> {
  const all = await kvGet<SessionStore>(env, KV_SESSIONS, {});
  return all[sessionId] ?? [];
}

export async function saveConstructionSession(
  env: SettingsEnv,
  sessionId: string,
  messages: ConstructionAgentMessage[],
): Promise<void> {
  const all = await kvGet<SessionStore>(env, KV_SESSIONS, {});
  all[sessionId] = messages.slice(-40);
  const keys = Object.keys(all);
  if (keys.length > 50) delete all[keys[0]!];
  await kvPut(env, KV_SESSIONS, all);
}
