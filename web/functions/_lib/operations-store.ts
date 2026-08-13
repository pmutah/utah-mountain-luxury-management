import { kvGet, kvPut, newId } from './kv-json';
import type { SettingsEnv } from './kv';
import type { EmailDraft, OpsTask, PropertyId, PropertyOpsConfig } from './agent/types';

const KV_TASKS = 'operationsTasks';
const KV_CONFIG = 'propertyConfig';
const KV_DRAFTS = 'emailDrafts';

export async function loadOpsTasks(env: SettingsEnv): Promise<OpsTask[]> {
  return kvGet(env, KV_TASKS, []);
}

export async function createOpsTask(
  env: SettingsEnv,
  task: Omit<OpsTask, 'id' | 'createdAt' | 'status'>,
): Promise<OpsTask> {
  const item: OpsTask = {
    ...task,
    id: newId('task'),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const list = await loadOpsTasks(env);
  list.push(item);
  await kvPut(env, KV_TASKS, list);
  return item;
}

export async function updateOpsTask(
  env: SettingsEnv,
  id: string,
  patch: Partial<OpsTask>,
): Promise<OpsTask | null> {
  const list = await loadOpsTasks(env);
  const idx = list.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx]!, ...patch };
  await kvPut(env, KV_TASKS, list);
  return list[idx]!;
}

const DEFAULT_PROPERTY_CONFIG: Record<PropertyId, PropertyOpsConfig> = {
  ranch: {
    houseRules: 'Quiet hours 10pm–8am. No parties. Max occupancy per listing.',
    lockCodeTemplate: 'Your door code is {code}. Check-in after 4pm.',
  },
  lindon: {
    houseRules: 'Quiet hours 10pm–8am. No smoking indoors.',
    lockCodeTemplate: 'Your door code is {code}. Check-in after 4pm.',
  },
  river: {
    houseRules:
      'Quiet hours in this mountain neighborhood. Whole-house rental only. No parties without written approval. Follow septic drain and trash guidelines in the house manual.',
    lockCodeTemplate:
      'Your door code is {code}. Check-in after 4pm. House manual and lock details are sent after booking.',
  },
};

export async function loadPropertyConfig(
  env: SettingsEnv,
): Promise<Record<PropertyId, PropertyOpsConfig>> {
  const stored = await kvGet<Partial<Record<PropertyId, PropertyOpsConfig>>>(env, KV_CONFIG, {});
  return {
    ranch: { ...DEFAULT_PROPERTY_CONFIG.ranch, ...stored.ranch },
    lindon: { ...DEFAULT_PROPERTY_CONFIG.lindon, ...stored.lindon },
    river: { ...DEFAULT_PROPERTY_CONFIG.river, ...stored.river },
  };
}

export async function savePropertyConfig(
  env: SettingsEnv,
  config: Record<PropertyId, PropertyOpsConfig>,
): Promise<Record<PropertyId, PropertyOpsConfig>> {
  return kvPut(env, KV_CONFIG, config);
}

export async function loadEmailDrafts(env: SettingsEnv): Promise<EmailDraft[]> {
  return kvGet(env, KV_DRAFTS, []);
}

export async function createEmailDraft(
  env: SettingsEnv,
  draft: Omit<EmailDraft, 'id' | 'createdAt' | 'status'>,
): Promise<EmailDraft> {
  const item: EmailDraft = {
    ...draft,
    id: newId('draft'),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  const list = await loadEmailDrafts(env);
  list.push(item);
  await kvPut(env, KV_DRAFTS, list);
  return item;
}

export function draftGuestCheckInMessage(
  guestName: string,
  propertyName: string,
  checkIn: string,
  config: PropertyOpsConfig,
  lockCode = '****',
): string {
  const template =
    config.lockCodeTemplate ??
    'Welcome! Your check-in is {checkIn}. Door code: {code}.';
  return `Hi ${guestName},\n\n${template
    .replace('{code}', lockCode)
    .replace('{checkIn}', checkIn)}\n\nProperty: ${propertyName}\n\n${config.houseRules ? `House rules: ${config.houseRules}` : ''}\n\nThank you!`;
}

export function draftCleanerNotification(
  propertyName: string,
  checkoutDate: string,
  config: PropertyOpsConfig,
): string {
  return `Cleaning turnover needed at ${propertyName} after checkout on ${checkoutDate}. Please confirm schedule.${
    config.cleanerPhone ? ` Contact: ${config.cleanerPhone}` : ''
  }`;
}
