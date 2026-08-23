export const CONSTRUCTION_STAGES = [
  'Planning',
  'Permits',
  'Site / Foundation',
  'Framing',
  'Rough MEP',
  'Insulation / Dry-in',
  'Drywall',
  'Finishes',
  'Punch',
  'Certificate of Occupancy',
] as const;

export type ConstructionStageName = (typeof CONSTRUCTION_STAGES)[number];
