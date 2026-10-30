import type { HouseId } from './types';

export type SampleComp = {
  id: string;
  house: HouseId;
  name: string;
  area: string;
  beds: number;
  sleeps: number;
  rating: number;
  reviews: number;
  guestFavorite: boolean;
  distanceMi: number;
  /** Shoulder-season guest nightly, before weekend and month factors. */
  baseGuest: number;
  occupancy: number;
};

/**
 * Stand-in comps so the board can be built and judged before an AirROI key exists.
 * Names are labels, not live listings. Live comps replace this list.
 */
export const SAMPLE_COMPS: SampleComp[] = [
  { id: 'river-1', house: 'river', name: 'Sample · Canyon lodge', area: 'Sundance', beds: 6, sleeps: 16, rating: 4.93, reviews: 86, guestFavorite: true, distanceMi: 2.4, baseGuest: 2100, occupancy: 0.62 },
  { id: 'river-2', house: 'river', name: 'Sample · River bench home', area: 'Vivian Park', beds: 7, sleeps: 18, rating: 4.89, reviews: 41, guestFavorite: true, distanceMi: 0.8, baseGuest: 2400, occupancy: 0.58 },
  { id: 'river-3', house: 'river', name: 'Sample · Provo Canyon estate', area: 'Provo Canyon', beds: 8, sleeps: 22, rating: 4.97, reviews: 64, guestFavorite: true, distanceMi: 3.1, baseGuest: 2750, occupancy: 0.71 },
  { id: 'river-4', house: 'river', name: 'Sample · Alpine loop cabin', area: 'Sundance', beds: 5, sleeps: 14, rating: 4.81, reviews: 120, guestFavorite: false, distanceMi: 4.6, baseGuest: 1680, occupancy: 0.66 },
  { id: 'river-5', house: 'river', name: 'Sample · Wildwood lodge', area: 'Wildwood', beds: 6, sleeps: 16, rating: 4.86, reviews: 33, guestFavorite: true, distanceMi: 1.9, baseGuest: 1980, occupancy: 0.54 },
  { id: 'river-6', house: 'river', name: 'Sample · Bridal Veil house', area: 'Provo Canyon', beds: 5, sleeps: 12, rating: 4.74, reviews: 210, guestFavorite: false, distanceMi: 6.2, baseGuest: 1420, occupancy: 0.7 },
  { id: 'river-7', house: 'river', name: 'Sample · South fork retreat', area: 'South Fork', beds: 7, sleeps: 20, rating: 4.91, reviews: 28, guestFavorite: true, distanceMi: 5.4, baseGuest: 2550, occupancy: 0.49 },
  { id: 'river-8', house: 'river', name: 'Sample · Midway mountain home', area: 'Midway', beds: 6, sleeps: 16, rating: 4.88, reviews: 77, guestFavorite: true, distanceMi: 14, baseGuest: 1890, occupancy: 0.6 },
  { id: 'river-9', house: 'river', name: 'Sample · Deer Creek view', area: 'Deer Creek', beds: 5, sleeps: 14, rating: 4.7, reviews: 54, guestFavorite: false, distanceMi: 8.8, baseGuest: 1510, occupancy: 0.57 },
  { id: 'river-10', house: 'river', name: 'Sample · Timpanogos cabin', area: 'Sundance', beds: 4, sleeps: 10, rating: 4.95, reviews: 140, guestFavorite: true, distanceMi: 3.7, baseGuest: 1320, occupancy: 0.74 },
  { id: 'ranch-1', house: 'ranch', name: 'Sample · Lindon group home', area: 'Lindon', beds: 6, sleeps: 16, rating: 4.9, reviews: 95, guestFavorite: true, distanceMi: 0.4, baseGuest: 720, occupancy: 0.64 },
  { id: 'ranch-2', house: 'ranch', name: 'Sample · Center Street house', area: 'Lindon', beds: 5, sleeps: 14, rating: 4.84, reviews: 61, guestFavorite: true, distanceMi: 0.2, baseGuest: 640, occupancy: 0.59 },
  { id: 'ranch-3', house: 'ranch', name: 'Sample · Pleasant Grove estate', area: 'Pleasant Grove', beds: 6, sleeps: 18, rating: 4.92, reviews: 44, guestFavorite: true, distanceMi: 2.1, baseGuest: 810, occupancy: 0.55 },
  { id: 'ranch-4', house: 'ranch', name: 'Sample · Vineyard modern', area: 'Vineyard', beds: 5, sleeps: 12, rating: 4.78, reviews: 130, guestFavorite: false, distanceMi: 3.4, baseGuest: 590, occupancy: 0.68 },
  { id: 'ranch-5', house: 'ranch', name: 'Sample · Orem reunion house', area: 'Orem', beds: 7, sleeps: 20, rating: 4.87, reviews: 38, guestFavorite: true, distanceMi: 4.8, baseGuest: 880, occupancy: 0.51 },
  { id: 'ranch-6', house: 'ranch', name: 'Sample · Cedar Hills home', area: 'Cedar Hills', beds: 5, sleeps: 12, rating: 4.8, reviews: 72, guestFavorite: false, distanceMi: 3.9, baseGuest: 560, occupancy: 0.63 },
  { id: 'ranch-7', house: 'ranch', name: 'Sample · Highland retreat', area: 'Highland', beds: 6, sleeps: 14, rating: 4.96, reviews: 22, guestFavorite: true, distanceMi: 5.5, baseGuest: 940, occupancy: 0.48 },
  { id: 'ranch-8', house: 'ranch', name: 'Sample · American Fork house', area: 'American Fork', beds: 4, sleeps: 10, rating: 4.73, reviews: 160, guestFavorite: false, distanceMi: 4.2, baseGuest: 480, occupancy: 0.72 },
  { id: 'ranch-9', house: 'ranch', name: 'Sample · PG orchard house', area: 'Pleasant Grove', beds: 5, sleeps: 13, rating: 4.85, reviews: 49, guestFavorite: true, distanceMi: 2.6, baseGuest: 670, occupancy: 0.6 },
  { id: 'ranch-10', house: 'ranch', name: 'Sample · Lindon cul-de-sac', area: 'Lindon', beds: 4, sleeps: 10, rating: 4.77, reviews: 88, guestFavorite: false, distanceMi: 0.9, baseGuest: 510, occupancy: 0.66 },
  { id: 'lindon-1', house: 'lindon', name: 'Sample · Harcliff neighbor', area: 'Lindon', beds: 4, sleeps: 8, rating: 4.91, reviews: 110, guestFavorite: true, distanceMi: 0.2, baseGuest: 210, occupancy: 0.7 },
  { id: 'lindon-2', house: 'lindon', name: 'Sample · Lindon family home', area: 'Lindon', beds: 3, sleeps: 6, rating: 4.86, reviews: 74, guestFavorite: true, distanceMi: 0.5, baseGuest: 175, occupancy: 0.73 },
  { id: 'lindon-3', house: 'lindon', name: 'Sample · PG starter house', area: 'Pleasant Grove', beds: 3, sleeps: 7, rating: 4.8, reviews: 140, guestFavorite: false, distanceMi: 1.8, baseGuest: 155, occupancy: 0.76 },
  { id: 'lindon-4', house: 'lindon', name: 'Sample · Vineyard townhome', area: 'Vineyard', beds: 3, sleeps: 6, rating: 4.74, reviews: 96, guestFavorite: false, distanceMi: 2.7, baseGuest: 145, occupancy: 0.8 },
  { id: 'lindon-5', house: 'lindon', name: 'Sample · Orem BYU house', area: 'Orem', beds: 4, sleeps: 8, rating: 4.88, reviews: 53, guestFavorite: true, distanceMi: 4.1, baseGuest: 195, occupancy: 0.69 },
  { id: 'lindon-6', house: 'lindon', name: 'Sample · Lindon rambler', area: 'Lindon', beds: 4, sleeps: 9, rating: 4.83, reviews: 67, guestFavorite: true, distanceMi: 0.7, baseGuest: 188, occupancy: 0.67 },
  { id: 'lindon-7', house: 'lindon', name: 'Sample · Cedar Hills family', area: 'Cedar Hills', beds: 4, sleeps: 8, rating: 4.9, reviews: 41, guestFavorite: true, distanceMi: 3.3, baseGuest: 230, occupancy: 0.58 },
  { id: 'lindon-8', house: 'lindon', name: 'Sample · AF bungalow', area: 'American Fork', beds: 3, sleeps: 6, rating: 4.71, reviews: 180, guestFavorite: false, distanceMi: 3.8, baseGuest: 140, occupancy: 0.78 },
  { id: 'lindon-9', house: 'lindon', name: 'Sample · Geneva house', area: 'Lindon', beds: 3, sleeps: 6, rating: 4.79, reviews: 58, guestFavorite: false, distanceMi: 1.1, baseGuest: 162, occupancy: 0.71 },
  { id: 'lindon-10', house: 'lindon', name: 'Sample · State Street cottage', area: 'Pleasant Grove', beds: 2, sleeps: 5, rating: 4.68, reviews: 90, guestFavorite: false, distanceMi: 2.2, baseGuest: 125, occupancy: 0.82 },
];

/** Alternates that step in when a primary comp is hidden. Still sample data. */
export const BENCH_COMPS: SampleComp[] = [
  { id: 'river-b1', house: 'river', name: 'Sample · Vivian Park lodge', area: 'Vivian Park', beds: 7, sleeps: 18, rating: 4.9, reviews: 36, guestFavorite: true, distanceMi: 1.2, baseGuest: 2300, occupancy: 0.6 },
  { id: 'river-b2', house: 'river', name: 'Sample · Sundance estate', area: 'Sundance', beds: 8, sleeps: 20, rating: 4.94, reviews: 52, guestFavorite: true, distanceMi: 2.8, baseGuest: 2600, occupancy: 0.57 },
  { id: 'ranch-b1', house: 'ranch', name: 'Sample · Lindon estate', area: 'Lindon', beds: 7, sleeps: 18, rating: 4.93, reviews: 29, guestFavorite: true, distanceMi: 0.6, baseGuest: 860, occupancy: 0.52 },
  { id: 'ranch-b2', house: 'ranch', name: 'Sample · Pleasant Grove modern', area: 'Pleasant Grove', beds: 6, sleeps: 16, rating: 4.89, reviews: 47, guestFavorite: true, distanceMi: 1.7, baseGuest: 760, occupancy: 0.61 },
  { id: 'lindon-b1', house: 'lindon', name: 'Sample · Mahogany home', area: 'Lindon', beds: 4, sleeps: 8, rating: 4.92, reviews: 33, guestFavorite: true, distanceMi: 0.4, baseGuest: 205, occupancy: 0.66 },
  { id: 'lindon-b2', house: 'lindon', name: 'Sample · Geneva cottage', area: 'Lindon', beds: 3, sleeps: 6, rating: 4.84, reviews: 71, guestFavorite: false, distanceMi: 0.9, baseGuest: 170, occupancy: 0.74 },
];

export function compsFor(house: HouseId): SampleComp[] {
  return SAMPLE_COMPS.filter((comp) => comp.house === house);
}

export function benchFor(house: HouseId): SampleComp[] {
  return BENCH_COMPS.filter((comp) => comp.house === house);
}
