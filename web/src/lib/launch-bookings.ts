/** Countdown to the first River stays. After that day, this does not say the house is open. */
export function riverLaunchLine(days: number): string {
  if (days === 1) return '1 day until the first stays';
  if (days > 1) return `${days} days until the first stays`;
  if (days === 0) return 'First stays are today';
  return 'First stays have started';
}

/** The launch list when the bookings cannot be read. No names and no stand-in stays. */
export function launchBookingsNote(unreadable: boolean): string {
  if (!unreadable) return '';
  return 'Saved bookings could not be read. This list is not using a stand-in. Nothing was written over them.';
}
