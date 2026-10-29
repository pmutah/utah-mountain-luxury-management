import type { Reservation } from './api';
import type { HouseId } from './luxury';
import { buildTurnovers, type Turnover } from './today';

export type CleanStep = {
  id: string;
  label: string;
};

export type CleanJob = Turnover & {
  priority: boolean;
  steps: CleanStep[];
};

const STEPS: CleanStep[] = [
  { id: 'beds', label: 'Strip and remake every bed' },
  { id: 'linens', label: 'Start the linens' },
  { id: 'kitchen', label: 'Kitchen, dishes, and coffee' },
  { id: 'baths', label: 'Bathrooms and towels' },
  { id: 'floors', label: 'Floors and trash' },
  { id: 'photos', label: 'Photo each room before you leave' },
];

const SAME_DAY: CleanStep = { id: 'window', label: 'Same-day turn. Finish before 4pm.' };

export function cleanJobs(reservations: Reservation[], asOf: string, horizonDays = 14): CleanJob[] {
  return buildTurnovers(reservations, asOf, horizonDays).map((turn) => {
    const priority = turn.gapNights === 0;
    return {
      ...turn,
      priority,
      steps: priority ? [SAME_DAY, ...STEPS] : STEPS,
    };
  });
}

export type { HouseId };
