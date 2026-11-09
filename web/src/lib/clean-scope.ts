import { RIVER_UNIT_DETAIL, RIVER_UNITS } from './river-units';

/**
 * Scoping a cleaning step to the parts of the Riverhouse a turn actually touches.
 *
 * This lives on its own, importing only the unit table, because **both** the host's desk and the cleaner's own page build
 * a step list and both have to say the same thing. Putting it in `clean.ts` made the cleaner's page depend on the desk's
 * module and created a cycle (`clean-link → clean-progress → clean-link`). One rule, no loop.
 *
 * "Strip and remake every bed" is right for a whole-house turn and wrong for the Garage Suite, which has two beds in a
 * house with eleven. A cleaner told to do the whole house does hours of work nobody stayed in, and on a part turn walks
 * into rooms another guest is using.
 *
 * Only the steps that name a whole-house scope are rewritten. A generic step stays exactly as written, because inventing a
 * narrower instruction would be its own kind of wrong.
 */

export type ScopableStep = { id: string; label: string };

/** English and Spanish labels for the two steps whose scope is the house. */
const SCOPED: Record<string, { en: (n: number, names: string, rooms: number) => string; es: (n: number, names: string, rooms: number) => string }> = {
  beds: {
    en: (beds, names, bedrooms) =>
      `Strip and remake the ${beds} bed${beds === 1 ? '' : 's'} in ${names} (${bedrooms} bedroom${bedrooms === 1 ? '' : 's'}), not the whole house`,
    es: (beds, names, bedrooms) =>
      `Quitar y volver a hacer las ${beds} camas de ${names} (${bedrooms} dormitorio${bedrooms === 1 ? '' : 's'}), no toda la casa`,
  },
  baths: {
    en: (baths, names) =>
      `Bathrooms and towels in ${names} only (${baths} bath${baths === 1 ? '' : 's'}), not the whole house`,
    es: (baths, names) =>
      `Baños y toallas solo en ${names} (${baths} baño${baths === 1 ? '' : 's'}), no toda la casa`,
  },
};

/**
 * Rewrite a step for the parts this turn occupies.
 *
 * No parts, or every part, means the house — so the step is returned untouched. That is deliberate on both sides: an
 * unknown part name scopes nothing rather than guessing, and taking all three parts *is* the whole house.
 */
export function scopeStep(
  step: ScopableStep,
  units: readonly string[] | undefined,
  lang: 'en' | 'es' = 'en',
): ScopableStep {
  const parts = (units ?? []).filter((unit): unit is (typeof RIVER_UNITS)[number] =>
    (RIVER_UNITS as readonly string[]).includes(unit),
  );
  if (parts.length === 0) return step;
  if (parts.length === RIVER_UNITS.length) return step;

  const rule = SCOPED[step.id];
  if (!rule) return step;

  const scoped = RIVER_UNIT_DETAIL.filter((detail) => parts.includes(detail.id));
  const names = scoped.map((detail) => detail.name.replace('River ', '')).join(' and ');
  const beds = scoped.reduce((sum, detail) => sum + detail.beds, 0);
  const baths = scoped.reduce((sum, detail) => sum + detail.baths, 0);
  const bedrooms = scoped.reduce((sum, detail) => sum + detail.bedrooms, 0);

  return {
    ...step,
    label: step.id === 'beds' ? rule[lang](beds, names, bedrooms) : rule[lang](baths, names, bedrooms),
  };
}
