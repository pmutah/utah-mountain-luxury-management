import { radarDiff } from '../src/lib/platform/back-office.ts';

for (const row of radarDiff()) {
  console.log(`${row.status} ${row.featureId}: ${row.backlog}`);
}
