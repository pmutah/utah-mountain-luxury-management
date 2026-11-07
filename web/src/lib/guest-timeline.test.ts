import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { bothHouseMessageNote, guestTimeline, quoteCalendarLine, quoteMessageNote, quoteMessageSchedule, readTimelineSwitches, stayMessageNote, stayMessageSchedule, timelineOnCount, timelineStayFor, timelineUnreadLine, TIMELINE_IDS } from './guest-timeline.ts';

test('each house has the full preview and no code, price, or discount', () => {
  for (const house of ['river', 'ranch', 'lindon'] as const) {
    const messages = guestTimeline(house);
    assert.deepEqual(
      messages.map((message) => message.id),
      [...TIMELINE_IDS],
    );
    const text = messages.map((message) => `${message.subject} ${message.body}`).join('\n');
    assert.equal(text.includes('$'), false);
    assert.equal(/code\s*\d|\b\d{4}\b/i.test(text), false);
    assert.match(text, /door code stays off this message/);
    assert.match(text, /does not include the code/);
    assert.match(text, /This is not a discount/);
    const back = messages.find((message) => message.id === 'return')?.body ?? '';
    assert.equal(back.includes('Open weeks'), false);
    assert.match(back, /does not name an open week/);
    assert.match(back, /Nothing is sent/);
    assert.match(text, /does not post one/);
    assert.match(text, /4:00 PM/);
    assert.match(text, /11:00 AM/);
  }
  assert.match(guestTimeline('river').find((message) => message.id === 'return')?.body ?? '', /7 King Suites/);
  assert.match(guestTimeline('ranch').find((message) => message.id === 'return')?.body ?? '', /Hot Tub/);
  assert.match(guestTimeline('lindon').find((message) => message.id === 'return')?.body ?? '', /near BYU/);
  const river = guestTimeline('river').map((message) => message.body).join(' ');
  assert.match(river, /septic/i);
  assert.match(guestTimeline('river').find((message) => message.id === 'mid')?.body ?? '', /While you are here: Sundance Mountain Resort, Tree Room at Sundance, Provo River tubing and rafting/);
  assert.match(guestTimeline('ranch').find((message) => message.id === 'mid')?.body ?? '', /While you are here: Sundance Mountain Resort, Oteo, Provo River Parkway/);
  assert.match(river, /Provo Canyon/);
  assert.match(guestTimeline('river').find((message) => message.id === 'week')?.body ?? '', /Canyon grocery drop/);
  assert.match(guestTimeline('river').find((message) => message.id === 'week')?.body ?? '', /wait until the calendar can be read/);
  assert.match(guestTimeline('ranch').find((message) => message.id === 'week')?.body ?? '', /Hot tub ready at arrival/);
  assert.match(guestTimeline('river').find((message) => message.id === 'week')?.body ?? '', /each stay-agreement topic is opened/);
  assert.match(guestTimeline('river').find((message) => message.id === 'week')?.body ?? '', /does not sign the agreement/);
  assert.match(guestTimeline('river').find((message) => message.id === 'eve')?.body ?? '', /open each stay-agreement topic/);
  assert.match(guestTimeline('river').find((message) => message.id === 'eve')?.body ?? '', /does not sign the agreement/);
  assert.match(guestTimeline('river').find((message) => message.id === 'eve')?.body ?? '', /Winter driving/);
  assert.match(guestTimeline('ranch').find((message) => message.id === 'eve')?.body ?? '', /cover on when not in use/);
  assert.match(guestTimeline('river').find((message) => message.id === 'eve')?.body ?? '', /These steps are from the published guide/);
  assert.equal((guestTimeline('river').find((message) => message.id === 'eve')?.body ?? '').includes('$'), false);
  assert.equal((guestTimeline('lindon').find((message) => message.id === 'week')?.body ?? '').includes('Hot tub'), false);
  assert.match(guestTimeline('river').find((message) => message.id === 'leave')?.body ?? '', /Only toilet paper/);
  assert.match(guestTimeline('ranch').find((message) => message.id === 'leave')?.body ?? '', /hot tub cover/);
  assert.equal((guestTimeline('lindon').find((message) => message.id === 'leave')?.body ?? '').includes('toilet paper'), false);
  assert.equal((guestTimeline('lindon').find((message) => message.id === 'leave')?.body ?? '').toLowerCase().includes('hot tub'), false);
  const booked = guestTimeline('river').find((message) => message.id === 'booked')?.body ?? '';
  assert.match(booked, /at least 2 nights/);
  assert.match(booked, /provided as-is/);
  assert.match(booked, /does not insure belongings, vehicles, or cash/);
  assert.match(booked, /not a residential lease/);
  assert.match(booked, /The stay ends at checkout/);
  assert.match(booked, /This message does not sign that/);
  assert.equal(booked.includes('This page'), false);
  assert.match(guestTimeline('ranch').find((message) => message.id === 'booked')?.body ?? '', /A weekday can be 1 night/);
  const ranch = guestTimeline('ranch').map((message) => message.body).join(' ');
  assert.match(ranch, /Hot tub/);
  assert.equal(/septic/i.test(ranch), false);
  const lindon = guestTimeline('lindon').map((message) => message.body).join(' ');
  assert.equal(/hot tub|septic/i.test(lindon), false);
});

test('a dated preview names that stay and leaves the price and the code off', () => {
  const messages = guestTimeline('river', { checkIn: '2026-11-06', checkOut: '2026-11-08' });
  const booked = messages.find((message) => message.id === 'booked');
  const text = messages.map((message) => `${message.when} ${message.subject} ${message.body}`).join('\n');
  assert.match(booked?.body ?? '', /Check-in is Nov 6/);
  assert.match(booked?.body ?? '', /Check-out is Nov 8/);
  assert.match(booked?.body ?? '', /BYU at Utah/);
  assert.match(booked?.body ?? '', /Nothing extra is added/);
  assert.match(booked?.body ?? '', /at least 2 nights/);
  assert.match(booked?.body ?? '', /Thanksgiving is 4 nights/);
  assert.equal(messages.find((message) => message.id === 'week')?.when, 'Seven days before Nov 6');
  assert.equal(messages.find((message) => message.id === 'mid')?.when, 'Halfway through, Nov 7');
  assert.match(messages.find((message) => message.id === 'mid')?.body ?? '', /BYU at Utah/);
  assert.match(messages.find((message) => message.id === 'mid')?.body ?? '', /Nothing extra is added/);
  assert.match(messages.find((message) => message.id === 'mid')?.body ?? '', /Nothing is sent/);
  const plain = guestTimeline('river', { checkIn: '2026-11-02', checkOut: '2026-11-04' });
  assert.equal((plain.find((message) => message.id === 'mid')?.body ?? '').includes('This stay covers'), false);
  assert.match(messages.find((message) => message.id === 'leave')?.body ?? '', /Checkout is Nov 8 at 11:00 AM/);
  assert.equal(text.includes('$'), false);
  assert.equal(/code\s*\d/i.test(text), false);
  assert.match(text, /does not include the code/);
});

test('the next stay in progress is the one the preview uses', () => {
  const stays = [
    { propertyId: 'river', checkIn: '2026-11-20', checkOut: '2026-11-23', status: 'confirmed' },
    { propertyId: 'river', checkIn: '2026-11-01', checkOut: '2026-11-04', status: 'confirmed' },
    { propertyId: 'river', checkIn: '2026-11-02', checkOut: '2026-11-06', status: 'cancelled' },
    { propertyId: 'ranch', checkIn: '2026-11-01', checkOut: '2026-11-04', status: 'confirmed' },
  ];
  assert.deepEqual(timelineStayFor('river', stays, '2026-11-02'), { checkIn: '2026-11-01', checkOut: '2026-11-04' });
  assert.deepEqual(timelineStayFor('ranch', stays, '2026-10-30'), { checkIn: '2026-11-01', checkOut: '2026-11-04' });
  assert.equal(timelineStayFor('lindon', stays, '2026-11-02'), null);
});

test('a switch stays off only when it was saved off', () => {
  const fresh = readTimelineSwitches(null);
  assert.equal(timelineOnCount(fresh.river), 8);
  const saved = readTimelineSwitches(JSON.stringify({ river: { eve: false, booked: true }, ranch: { leave: false } }));
  assert.equal(saved.river.eve, false);
  assert.equal(saved.river.booked, true);
  assert.equal(saved.ranch.leave, false);
  assert.equal(saved.lindon.review, true);
  assert.equal(timelineOnCount(saved.river), 7);
  assert.equal(readTimelineSwitches('not-json').river.booked, true);
});

test('the quote labels the message list as not booked', () => {
  const note = quoteMessageNote();
  const calendar = quoteCalendarLine();
  assert.match(note, /This stay is not booked/);
  assert.match(note, /Nothing is sent/);
  assert.match(calendar, /does not hold the dates/);
  assert.match(calendar, /This stay is not booked/);
  const text = `${note}\n${calendar}`;
  assert.equal(text.includes('$'), false);
  assert.equal(/code\s*\d/i.test(text), false);
  const booked = guestTimeline('river', { checkIn: '2026-11-13', checkOut: '2026-11-15' }).find((message) => message.id === 'booked');
  assert.match(booked?.body ?? '', /BYU vs Baylor/);
  assert.equal((booked?.body ?? '').includes('$'), false);
  const quoteMessages = guestTimeline('river', { checkIn: '2026-11-13', checkOut: '2026-11-15' }, 'quote');
  const quoteText = quoteMessages.map((message) => message.body).join(' ');
  assert.equal(/still opens the day before/i.test(quoteText), false);
  assert.equal(/open on your phone the day before/i.test(quoteText), false);
  assert.match(guestTimeline('river', { checkIn: '2026-11-13', checkOut: '2026-11-15' }).map((message) => message.body).join(' '), /still opens the day before/i);
  const quote = quoteMessages.find((message) => message.id === 'booked');
  assert.match(quote?.subject ?? '', /is not booked/);
  assert.match(quote?.body ?? '', /is not booked/);
  assert.match(quote?.body ?? '', /Nothing is sent/);
  assert.match(quote?.body ?? '', /BYU vs Baylor/);
  assert.equal((quote?.subject ?? '').includes('confirmed'), false);
  assert.equal((quote?.body ?? '').includes('is confirmed'), false);
  assert.equal((quote?.body ?? '').includes('$'), false);
  const eve = guestTimeline('river', { checkIn: '2026-11-13', checkOut: '2026-11-15' }, 'quote').find((message) => message.id === 'eve');
  assert.match(eve?.subject ?? '', /^If this stay is booked:/);
  assert.match(eve?.body ?? '', /Winter driving/);
  assert.match(eve?.body ?? '', /Nothing is sent/);
  assert.equal((eve?.body ?? '').includes('$'), false);
  const arrive = guestTimeline('river', { checkIn: '2026-11-13', checkOut: '2026-11-15' }, 'quote').find((message) => message.id === 'arrive');
  assert.match(arrive?.subject ?? '', /^If this stay is booked:/);
  assert.match(arrive?.body ?? '', /Winter driving/);
  assert.match(arrive?.body ?? '', /These steps are from the published guide/);
  assert.equal((arrive?.body ?? '').includes('$'), false);
  assert.match(guestTimeline('ranch').find((message) => message.id === 'arrive')?.body ?? '', /cover on when not in use/);
  const hostArrive = guestTimeline('river', { checkIn: '2026-11-13', checkOut: '2026-11-15' }).find((message) => message.id === 'arrive');
  assert.equal((hostArrive?.subject ?? '').includes('If this stay is booked'), false);
  const unread = timelineUnreadLine();
  assert.match(unread, /could not be read/);
  assert.match(unread, /does not name a stay/);
  assert.match(unread, /Nothing is sent/);
  assert.equal(unread.includes('$'), false);
});

test('a chosen arrival and departure are named only on those messages', () => {
  const dates = { checkIn: '2026-11-13', checkOut: '2026-11-15' };
  const timed = guestTimeline('river', dates, 'quote', {
    arrival: '6:00 PM',
    departure: '11:00 AM',
    lateOpen: true,
  });
  const body = (id: string) => timed.find((message) => message.id === id)?.body ?? '';
  assert.match(body('eve'), /Arrival around 6:00 PM/);
  assert.match(body('arrive'), /Arrival around 6:00 PM/);
  assert.equal(body('booked').includes('Arrival around'), false);
  assert.match(body('leave'), /Leave at 11:00 AM/);
  assert.match(body('leave'), /Nothing is sent/);
  assert.equal(body('leave').includes('$'), false);
  const closed = guestTimeline('river', dates, 'quote', { departure: '2:00 PM', lateOpen: false });
  assert.equal((closed.find((message) => message.id === 'leave')?.body ?? '').includes('2:00 PM'), false);
  const open = guestTimeline('river', dates, 'quote', { departure: '2:00 PM', lateOpen: true });
  assert.match(open.find((message) => message.id === 'leave')?.body ?? '', /Leave at 2:00 PM/);
  const junk = guestTimeline('river', dates, 'quote', { arrival: '801-555-0100', departure: 'noon' });
  const junkText = junk.map((message) => message.body).join('\n');
  assert.equal(junkText.includes('801'), false);
  assert.equal(junkText.includes('noon'), false);
  const early = guestTimeline('river', dates, 'quote', { arrival: '6:00 PM', early: true });
  assert.equal((early.find((message) => message.id === 'arrive')?.body ?? '').includes('Arrival around'), false);
});

test('the stay phone lists the note schedule and leaves the message body off', () => {
  const rows = stayMessageSchedule('ranch', { checkIn: '2026-12-01', checkOut: '2026-12-04' });
  assert.deepEqual(
    rows.map((row) => row.id),
    [...TIMELINE_IDS],
  );
  assert.match(rows.find((row) => row.id === 'week')?.when ?? '', /Seven days before Dec 1/);
  assert.match(rows.find((row) => row.id === 'leave')?.when ?? '', /Checkout morning, Dec 4/);
  const text = rows.map((row) => `${row.when} ${row.subject}`).join('\n');
  assert.equal(text.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(text), false);
  assert.equal(text.includes('call 911'), false);
  const note = stayMessageNote();
  // The guest's phone has no send control, so this must say it cannot send from here. It must not
  // say nothing is ever sent: the host sends from the desk.
  assert.match(note, /notes this stay receives/);
  assert.match(note, /nothing on this phone sends one/);
  assert.match(note, /door code stays off this list/);
  assert.equal(note.includes('$'), false);
});

test('the host panel never claims messages are never sent', () => {
  /*
   * The timeline sits on the same page as a sender. It used to say "Nothing is sent" three times,
   * which was true before the sender existed and false after. Wording that says a capability is absent
   * when it is present is the same class of bug as a stale count.
   */
  const panel = readFileSync(join(process.cwd(), 'src', 'components', 'GuestTimeline.tsx'), 'utf8');
  const stripped = panel.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.equal(
    /Nothing is sent[.,]/.test(stripped),
    false,
    'the host timeline still says nothing is ever sent, but a sender sits on the same page',
  );
  // It must say the panel itself does not send on its own.
  assert.match(stripped, /Nothing here\s*\n?\s*sends on its own|does not stop the sender/);
  // And the guest phone, which has no send control, still says so.
  assert.match(stayMessageNote(), /nothing on this phone sends one/);
});

test('a two-house quote lists each house and leaves the stay unbooked', () => {
  const dates = { checkIn: '2026-11-06', checkOut: '2026-11-08' };
  for (const house of ['river', 'ranch'] as const) {
    const rows = quoteMessageSchedule(house, dates);
    assert.deepEqual(
      rows.map((row) => row.id),
      [...TIMELINE_IDS],
    );
    assert.match(rows.find((row) => row.id === 'booked')?.subject ?? '', new RegExp(`${house === 'river' ? 'River House' : 'Ranch House'} is not booked`));
    assert.equal((rows.find((row) => row.id === 'booked')?.subject ?? '').includes('confirmed'), false);
    assert.match(rows.find((row) => row.id === 'week')?.subject ?? '', /^If this stay is booked:/);
    assert.match(rows.find((row) => row.id === 'week')?.when ?? '', /Seven days before Nov 6/);
  }
  const text = ['river', 'ranch']
    .flatMap((house) => quoteMessageSchedule(house as 'river' | 'ranch', dates))
    .map((row) => `${row.when} ${row.subject}`)
    .join('\n');
  assert.equal(text.includes('$'), false);
  assert.equal(/door\s*code|wi-?fi|password/i.test(text), false);
  const note = bothHouseMessageNote();
  assert.match(note, /both houses/);
  assert.match(note, /not booked/);
  assert.match(note, /Nothing is sent/);
  assert.match(note, /door code stays off every message/);
  assert.equal(note.includes('$'), false);
});
