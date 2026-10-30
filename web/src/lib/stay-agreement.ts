import type { HouseId } from './market/types';

function topics(house: string): string {
  if (house === 'river') return 'occupancy, damage, the river, and a release';
  if (house === 'ranch') return 'occupancy, damage, the hot tub, and a release';
  return 'occupancy, damage, and a release';
}

/** What the stay agreement covers. Reading the rules does not sign it. */
export function agreementLine(house: HouseId | string, where: 'page' | 'phone' | 'paper'): string {
  const close =
    where === 'phone'
      ? 'This phone does not sign it.'
      : where === 'paper'
        ? 'This paper does not sign it.'
        : 'This page does not create that agreement.';
  return `The stay agreement covers ${topics(house)}. Reading the house rules does not sign it. ${close}`;
}

/** A request note records that the agreement was not signed. This does not send the request. */
export function agreementNote(house: HouseId): string {
  return `Stay agreement not signed. It covers ${topics(house)}.`;
}

/** The nightly brief covers every house. Nothing here signs the agreement. */
export function agreementBrief(): string {
  return 'The stay agreement covers occupancy, damage, the hot tub, the river, and a release. Reading the house rules does not sign it. Nothing here signs it.';
}

export type AgreementTopic = {
  id: 'occupancy' | 'damage' | 'place' | 'release';
  title: string;
  detail: string;
};

/** Topics a guest can read on the phone. Reading them does not sign the agreement or send anything. */
export function agreementTopics(house: HouseId | string): AgreementTopic[] {
  const topics: AgreementTopic[] = [
    {
      id: 'occupancy',
      title: 'Occupancy',
      detail: 'The stay is for the guests on the booking. This phone does not change that count.',
    },
    {
      id: 'damage',
      title: 'Damage',
      detail: 'Damage beyond normal use stays with the booking. This phone does not sign that.',
    },
  ];
  if (house === 'ranch') {
    topics.push({
      id: 'place',
      title: 'Hot tub',
      detail: 'Keep the hot tub cover on when it is not in use. No glass in or near the tub.',
    });
  } else if (house === 'river') {
    topics.push({
      id: 'place',
      title: 'The river',
      detail: 'The river and the septic are part of this stay. This phone does not sign a release.',
    });
  }
  topics.push({
    id: 'release',
    title: 'Release',
    detail: 'A release is part of the stay agreement. This phone does not sign it. Nothing is sent.',
  });
  return topics;
}

export function agreementReadComplete(house: HouseId | string, readIds: readonly string[]): boolean {
  return agreementTopics(house).every((topic) => readIds.includes(topic.id));
}

const READ_KEY = 'uml-agreement-topics';

function readStore(): Record<string, string[]> {
  try {
    if (typeof sessionStorage === 'undefined') return {};
    const raw = sessionStorage.getItem(READ_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const next: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!key || !Array.isArray(value)) continue;
      const ids = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
      if (ids.length) next[key] = ids;
    }
    return next;
  } catch {
    return {};
  }
}

/** Topics already opened on this phone. This does not sign the agreement. */
export function loadAgreementRead(token: string): string[] {
  if (!token) return [];
  return readStore()[token] ?? [];
}

/** Remember one topic on this phone. Nothing is sent. */
export function markAgreementTopic(token: string, topicId: string): string[] {
  if (!token || !topicId) return loadAgreementRead(token);
  const current = loadAgreementRead(token);
  const nextIds = current.includes(topicId) ? current : [...current, topicId];
  try {
    const next = readStore();
    next[token] = nextIds;
    sessionStorage.setItem(READ_KEY, JSON.stringify(next));
  } catch {
    // The topic still shows as read for this visit when the caller keeps the returned list.
  }
  return nextIds;
}
