import type { HouseId } from './market/types';

function topics(house: string): string {
  if (house === 'river') return 'occupancy, damage, the river, the house as-is, belongings, safety, a short stay rather than a lease, and a release';
  if (house === 'ranch') return 'occupancy, damage, the hot tub, the house as-is, belongings, safety, a short stay rather than a lease, and a release';
  return 'occupancy, damage, the house as-is, belongings, safety, a short stay rather than a lease, and a release';
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
  return 'The stay agreement covers occupancy, damage, the hot tub, the river, the house as-is, belongings, safety, a short stay rather than a lease, and a release. Reading the house rules does not sign it. Nothing here signs it.';
}

export type AgreementTopic = {
  id: 'occupancy' | 'damage' | 'place' | 'asis' | 'belongings' | 'safety' | 'license' | 'release';
  title: string;
  detail: string;
};

/** Topics a guest can read. Reading them does not sign the agreement or send anything. */
export function agreementTopics(
  house: HouseId | string,
  where: 'page' | 'phone' | 'paper' = 'phone',
): AgreementTopic[] {
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
    id: 'asis',
    title: 'As-is',
    detail:
      'The house is provided as-is. A broken amenity does not cancel the stay unless the host agrees in writing. The host may end the stay without a refund for a serious rules violation. This phone does not sign that. Nothing is sent.',
  });
  topics.push({
    id: 'belongings',
    title: 'Belongings',
    detail:
      'The host does not insure belongings, vehicles, or cash. Travel insurance and medical coverage stay with the guest. This phone does not sign that. Nothing is sent.',
  });
  topics.push({
    id: 'safety',
    title: 'Safety',
    detail:
      'No lifeguard is on duty. Children need a responsible adult around water, stairs, decks, and the street. No fireworks. This phone does not sign that. Nothing is sent.',
  });
  topics.push({
    id: 'license',
    title: 'Short stay',
    detail:
      'This is a short stay, not a residential lease. The stay ends at checkout. This phone does not sign that. Nothing is sent.',
  });
  topics.push({
    id: 'release',
    title: 'Release',
    detail: 'A release is part of the stay agreement. This phone does not sign it. Nothing is sent.',
  });
  if (where === 'phone') return topics;
  const surface = where === 'paper' ? 'This paper' : 'This page';
  return topics.map((topic) => ({ ...topic, detail: topic.detail.replaceAll('This phone', surface) }));
}

/** A visitor question stays on the occupancy topic. It does not invent a day-guest rule. */
export function visitorQuestion(query: string): boolean {
  const q = query.toLowerCase();
  if (/\b(pet|pets|dog|dogs|cat|cats)\b/.test(q)) return false;
  return /\b(visitor|visitors|day guest|day guests|extra guest|extra guests)\b/.test(q);
}

/** The published occupancy line for that surface. */
export function visitorLine(where: 'page' | 'phone'): string {
  const detail = agreementTopics('lindon', where).find((topic) => topic.id === 'occupancy')?.detail ?? '';
  if (!detail || detail.includes('$') || /door\s*code|wi-?fi|password/i.test(detail)) return '';
  return detail;
}

/** One stay-agreement topic, already written for a page. Same on every house. */
export function agreementTopicLine(id: 'asis' | 'belongings' | 'safety' | 'license'): string {
  const detail = agreementTopics('lindon', 'page').find((topic) => topic.id === id)?.detail ?? '';
  if (detail.includes('$') || /door\s*code|wi-?fi|password/i.test(detail)) return '';
  return detail;
}

/** The confirmation preview names as-is, belongings, and that this is not a lease. It does not sign or send. */
export function confirmationAgreement(): string {
  const text = [agreementTopicLine('asis'), agreementTopicLine('belongings'), agreementTopicLine('license')]
    .filter((line) => line.length > 0)
    .join(' ')
    .replaceAll('This page', 'This message');
  if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return '';
  return text;
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
