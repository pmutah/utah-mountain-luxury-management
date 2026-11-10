import assert from 'node:assert/strict';
import test from 'node:test';
import { directRequestReady, eventHoldLine, guestRuleLines, houseRules, PET_FEE, petRuleLine, quoteActionLine, quoteAgreementHold, quoteTimesHold, quoteTimesReady, requestHoldLine, rulesNote, rulesReadLine } from './house-rules.ts';

test('each house publishes its own rules and the request waits for them', () => {
  assert.equal(houseRules('river').some((rule) => rule.text.includes('septic')), true);
  assert.equal(houseRules('ranch').some((rule) => rule.text.includes('hot tub')), true);
  assert.equal(houseRules('lindon').some((rule) => rule.text.includes('No parties')), true);
  assert.equal(directRequestReady({ quoteOk: true, rulesRead: false, calendarLoading: false, calendarLive: true, partyOk: true }), false);
  assert.equal(directRequestReady({ quoteOk: true, rulesRead: true, calendarLoading: true, calendarLive: false, partyOk: true }), false);
  assert.equal(directRequestReady({ quoteOk: false, rulesRead: true, calendarLoading: false, calendarLive: true, partyOk: true }), false);
  assert.equal(directRequestReady({ quoteOk: true, rulesRead: true, calendarLoading: false, calendarLive: true, partyOk: false }), false);
  assert.equal(directRequestReady({ quoteOk: true, rulesRead: true, calendarLoading: false, calendarLive: false, partyOk: true }), false);
  assert.equal(directRequestReady({ quoteOk: true, rulesRead: true, calendarLoading: false, calendarLive: true, partyOk: true }), true);
  assert.equal(
    directRequestReady({ quoteOk: true, rulesRead: true, calendarLoading: false, calendarLive: true, partyOk: true, event: true }),
    false,
  );
  assert.equal(
    directRequestReady({ quoteOk: true, rulesRead: true, calendarLoading: false, calendarLive: true, partyOk: true, agreementRead: false }),
    false,
  );
  assert.equal(
    directRequestReady({ quoteOk: true, rulesRead: true, calendarLoading: false, calendarLive: true, partyOk: true, agreementRead: true }),
    true,
  );
  const river = eventHoldLine('river');
  assert.match(river, /does not take a party or event without written approval/);
  assert.match(river, /does not send that request/);
  assert.equal(river.includes('$'), false);
  assert.match(eventHoldLine('ranch'), /The Ranch House does not take a party/);
  assert.match(eventHoldLine('lindon'), /The Lindon House does not take a party/);
  assert.match(rulesNote('ranch'), /House rules read:.*Quiet hours 10 PM to 6 AM/);
  assert.match(rulesNote('ranch'), /hot tub/);
  assert.match(rulesNote('river'), /septic/);
  assert.match(rulesNote('lindon'), /No parties/);
  assert.equal(/password|door code/i.test(rulesNote('river')), false);
  const ranchPhone = guestRuleLines('ranch', 'No smoking indoors.');
  assert.match(ranchPhone.join('\n'), /Quiet hours 10 PM to 6 AM/);
  assert.match(ranchPhone.join('\n'), /hot tub cover/);
  assert.equal(ranchPhone.some((line) => line === 'No smoking indoors.'), false);
  const custom = guestRuleLines('lindon', 'Please lock the side gate.');
  assert.equal(custom[0], 'Please lock the side gate.');
  assert.match(custom.join('\n'), /Quiet hours 10 PM to 6 AM/);
  const hidden = guestRuleLines('river', 'The door code is 1234.');
  assert.equal(hidden.some((line) => /door code/i.test(line)), false);
  assert.match(hidden.join('\n'), /septic/);
  assert.equal(guestRuleLines('ranch', '').join('\n').includes('$'), false);
  const held = requestHoldLine({
    calendarLoading: false,
    calendarLive: false,
    both: false,
    event: false,
    agreementRead: true,
    partyOk: true,
    partyReason: '',
    quoteOk: true,
    quoteReason: null,
    rulesRead: true,
  });
  assert.match(held, /The calendar could not be read/);
  assert.match(held, /request stays off/);
  assert.match(held, /Nothing is sent/);
  assert.equal(held.includes('$'), false);
  const ready = requestHoldLine({
    calendarLoading: false,
    calendarLive: true,
    both: false,
    event: false,
    agreementRead: true,
    partyOk: true,
    partyReason: '',
    quoteOk: true,
    quoteReason: null,
    rulesRead: true,
  });
  assert.equal(ready, '');
  const booked = requestHoldLine({
    calendarLoading: false,
    calendarLive: true,
    both: false,
    event: false,
    agreementRead: false,
    partyOk: true,
    partyReason: '',
    quoteOk: false,
    quoteReason: 'Those nights are already booked.',
    rulesRead: false,
  });
  assert.match(booked, /Those nights are already booked/);
  assert.equal(booked.includes('Open each topic'), false);
  assert.match(booked, /Nothing is sent/);
  const together = requestHoldLine({
    calendarLoading: false,
    calendarLive: true,
    both: true,
    event: false,
    agreementRead: false,
    partyOk: false,
    partyReason: 'The River House sleeps 22.',
    quoteOk: false,
    quoteReason: 'The River House sleeps 22.',
    rulesRead: false,
    bothOfferOk: true,
  });
  assert.match(together, /Open each topic before the request/);
  assert.equal(together.includes('sleeps 22'), false);
  assert.match(together, /Nothing is sent/);
  const shortBoth = requestHoldLine({
    calendarLoading: false,
    calendarLive: true,
    both: true,
    event: false,
    agreementRead: false,
    partyOk: false,
    partyReason: 'The River House sleeps 22.',
    quoteOk: false,
    quoteReason: 'The River House sleeps 22.',
    rulesRead: false,
    bothOfferOk: false,
    bothReason: 'River: This stay needs at least 5 nights.',
  });
  assert.match(shortBoth, /at least 5 nights/);
  assert.equal(shortBoth.includes('sleeps 22'), false);
  assert.equal(shortBoth.includes('$'), false);
  const agreement = quoteAgreementHold();
  assert.match(agreement, /stay agreement stays off/);
  const partyAgreement = quoteAgreementHold('Add the number of overnight guests. Nothing is sent.');
  assert.match(partyAgreement, /Add the number of overnight guests/);
  assert.match(partyAgreement, /stay agreement stays off until then/);
  assert.equal(partyAgreement.includes('until this page can quote'), false);
  const bookedAgreement = quoteAgreementHold('Those nights are already booked. Nothing is sent.');
  assert.match(bookedAgreement, /already booked/);
  assert.equal(quoteAgreementHold('Preview $9. Nothing is sent.').includes('$'), false);
  assert.match(agreement, /Nothing is sent/);
  assert.equal(agreement.includes('$'), false);
  assert.equal(/\bis open\b/.test(agreement), false);
  const heldArrival = quoteActionLine(false, 'arrival');
  assert.match(heldArrival, /stays on this quote/);
  assert.match(heldArrival, /Nothing is sent/);
  assert.equal(heldArrival.includes('button'), false);
  assert.equal(quoteActionLine(false, 'rules').includes('button'), false);
  assert.equal(quoteActionLine(false, 'departure').includes('button'), false);
  assert.match(quoteActionLine(true, 'arrival'), /until you use the button/);
  const heldRules = rulesReadLine(false, false);
  assert.match(heldRules, /Reading them does not sign the stay agreement/);
  assert.match(heldRules, /Nothing is sent/);
  assert.equal(heldRules.includes('This request'), false);
  assert.match(rulesReadLine(true, true), /This request does not sign either agreement/);
  assert.equal(heldArrival.includes('$'), false);
  const pets = petRuleLine('page');
  /*
   * The page text names the policy and carries no figure — every guest-facing string is asserted to contain no `$`, so a page
   * can never quote a price, and the pet fee is a price. The desk line names it; this one does not.
   */
  assert.match(pets, /dogs only, up to 2/);
  assert.match(pets, /under 50 lb/);
  assert.match(pets, /No cats/);
  assert.match(pets, /A pet fee applies per stay/);
  assert.equal(pets.includes('$'), false, 'the guest page names the pet fee, which is a price');
  assert.equal(/will not invent one|does not name a pet rule/i.test(pets), false, 'the page narrates our old data gap');

  // The desk may name the fee, because a host asking is asking what to charge.
  assert.match(petRuleLine('desk'), /\$149/);
  assert.equal(PET_FEE, 149);
  assert.equal(quoteTimesReady({ partyOk: true, calendar: 'live', quoteOk: true, publishedRule: false }), true);
  assert.equal(quoteTimesReady({ partyOk: true, calendar: 'live', quoteOk: false, publishedRule: false }), false);
  assert.equal(quoteTimesReady({ partyOk: false, calendar: 'live', quoteOk: true, publishedRule: false }), false);
  assert.equal(quoteTimesReady({ partyOk: true, calendar: 'off', quoteOk: true, publishedRule: true }), false);
  assert.equal(quoteTimesReady({ partyOk: true, calendar: 'loading', quoteOk: true, publishedRule: false }), false);
  const hold = quoteTimesHold();
  assert.match(hold, /Arrival and departure times stay off/);
  const partyTimes = quoteTimesHold('Add the number of overnight guests. Nothing is sent.');
  assert.match(partyTimes, /Add the number of overnight guests/);
  assert.match(partyTimes, /Arrival and departure times stay off until then/);
  assert.equal(partyTimes.includes('until this page can quote'), false);
  assert.equal(quoteTimesHold('Preview $9. Nothing is sent.').includes('$'), false);
  assert.match(hold, /Nothing is sent/);
  assert.equal(hold.includes('$'), false);
  assert.equal(/\bis open\b/.test(hold), false);
});
