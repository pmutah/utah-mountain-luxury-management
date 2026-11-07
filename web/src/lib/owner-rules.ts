import { rateGuardLine } from './market/whatif';
import { agreementTopicLine } from './stay-agreement';
import { standingTurnLine } from './turn-clock';

/** How Ranch and River are split. No ledger amounts. */
export function ownerRules(): string[] {
  return [
    'Ranch and River pay a 20% management fee to Brandon first.',
    'What remains splits in half. Todd takes one half. Brandon and Stephanie take the other half.',
    'A loss after the fee splits the same way.',
    'A hot tub request at the Ranch House and a grocery drop at the River House follow that same split. This card does not say that anyone asked, and it does not charge either one.',
    'An early arrival and a later checkout on Ranch or River follow that same split. They wait until the calendar can be read.',
    'Lindon is Brandon’s. It is not on this page.',
    'Household purchases and construction bills are not on this page.',
    'This page does not change a booking or a saved expense.',
    rateGuardLine(),
  ];
}

/** The next Ranch and River checkout mornings. Lindon stays off. This is not the statement. */
export function ownerCheckoutLine(turns: readonly { house: string; checkOut: string }[] | null): string {
  const tail = 'Lindon is not on this list. This is not the statement. Names stay off this list. Nothing was booked or sent.';
  if (!turns) return `Ranch and River checkouts could not be read. ${tail}`;
  const rows = turns
    .filter((turn) => (turn.house === 'ranch' || turn.house === 'river') && /^\d{4}-\d{2}-\d{2}$/.test(turn.checkOut))
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut) || a.house.localeCompare(b.house));
  if (rows.length === 0) return `No Ranch or River checkout in the next two weeks. ${tail}`;
  const shown = rows.slice(0, 4);
  const more = rows.length - shown.length;
  const when = (iso: string) =>
    new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const name = (house: string) => (house === 'ranch' ? 'The Ranch House' : 'The River House');
  const list = shown.map((turn) => `${name(turn.house)} ${when(turn.checkOut)}`).join(', ');
  const extra = more > 0 ? ` ${more} more.` : '';
  const text = `Next Ranch and River checkouts: ${list}.${extra} ${tail}`;
  if (text.includes('$') || /door\s*code|wi-?fi|password/i.test(text)) return tail;
  return text;
}

/** The standing same-day clean for Ranch and River. It does not name a stay. Lindon stays off. */
export function ownerTurnLine(): string {
  const line = `Ranch and River. ${standingTurnLine('en')} Lindon is not on this page. Nothing was booked or sent.`;
  if (line.includes('$') || /door\s*code|wi-?fi|password/i.test(line)) {
    return 'Ranch and River. Lindon is not on this page. Nothing was booked or sent.';
  }
  return line;
}

/** What guests read before a direct request. This page does not sign it. Lindon stays off. */
export function ownerAgreementLines(): string[] {
  const lines = [
    'Guests read the stay agreement before a direct request. Ranch covers the hot tub. River covers the river and the septic. Lindon is not on this page.',
    agreementTopicLine('asis'),
    agreementTopicLine('belongings'),
    'This page does not sign the agreement. Nothing here sends it or changes a booking.',
  ];
  return lines.filter((line) => line.length > 0 && !line.includes('$') && !/door\s*code|wi-?fi|password/i.test(line));
}
