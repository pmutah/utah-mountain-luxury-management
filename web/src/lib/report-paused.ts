import { requestClosedLine } from './house-rules';

/** The management report stays blank until the bookings can be read. No figures. */
export function reportPausedLine(): string {
  return 'The management figures stay off this page until saved bookings can be read. This page is not using a stand-in list. Nothing was written over them. Documents stay available.';
}

/** The owner letter uses the statement. It stays off while that statement cannot be read. */
export function letterPausedLine(): string {
  return 'The letter stays off until saved bookings can be read. Nothing was written over them.';
}

/** Todd’s statement stays off while the bookings cannot be read. No stand-in total. */
export function ownerStatementPausedLine(): string {
  return `Todd’s statement stays off until saved bookings can be read. This page is not using a stand-in total. Nothing was written over them. ${requestClosedLine()}`;
}
