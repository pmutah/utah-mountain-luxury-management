export type VipStepId =
  | 'welcome'
  | 'occasion'
  | 'party'
  | 'arrive'
  | 'leave'
  | 'setting'
  | 'activities'
  | 'fishing'
  | 'bikes'
  | 'skiing'
  | 'amenities'
  | 'food'
  | 'snacks'
  | 'drinks'
  | 'allergies'
  | 'movie'
  | 'popcorn'
  | 'else';

/** River preference steps. Arrival is asked before the house is set, and sending stays on the last step. */
export function vipStepIds(activities: readonly string[] | undefined): VipStepId[] {
  const next: VipStepId[] = ['welcome', 'occasion', 'party', 'arrive', 'leave', 'setting', 'activities'];
  if (activities?.includes('Fishing')) next.push('fishing');
  if (activities?.includes('Mountain / trail biking')) next.push('bikes');
  if (activities?.includes('Skiing')) next.push('skiing');
  next.push('amenities', 'food', 'snacks', 'drinks', 'allergies', 'movie', 'popcorn', 'else');
  return next;
}
