import assert from 'node:assert/strict';
import test from 'node:test';
import {
  preferenceActivities,
  preferenceAmenities,
  preferenceCardLines,
  preferenceCardNote,
  preferenceEvenings,
  preferencePartyCount,
  preferencePetLine,
  preferenceWhy,
} from './preference-choices.ts';

test('preference choices follow the published guide for that house', () => {
  const river = preferenceAmenities('river').join('\n');
  const ranch = preferenceAmenities('ranch').join('\n');
  const lindon = preferenceAmenities('lindon').join('\n');
  assert.match(river, /The river/);
  assert.match(river, /Garage/);
  assert.equal(river.includes('Hot tub'), false);
  assert.match(ranch, /Hot tub/);
  assert.equal(ranch.includes('The river'), false);
  assert.equal(lindon.includes('Hot tub'), false);
  assert.equal(lindon.includes('The river'), false);
  const text = [river, ranch, lindon, preferenceWhy('ranch').join('\n'), preferenceEvenings('ranch').join('\n'), preferenceActivities('river').join('\n')].join('\n');
  assert.equal(/sauna|fire pit|hot tub nights/i.test(text), false);
  assert.equal(preferenceWhy('ranch').includes('The river'), false);
  assert.equal(preferenceWhy('river').includes('The river'), true);
  assert.match(preferenceEvenings('ranch').join('\n'), /Hot tub/);
  assert.equal(preferenceEvenings('river').includes('Hot tub'), false);
  assert.match(ranch, /Sundance/);
  assert.match(river, /Fireplace/);
  assert.equal(/cooking together|cook and linger|early to bed|near sundance/i.test(text), false);
  assert.equal(preferenceActivities('river').includes('Hot tub'), false);
  const card = preferenceCardLines('ranch', {
    tripWhy: ['Family / reunion', 'The river'],
    topAmenities: ['Hot tub', 'Sauna', 'Fire pit'],
    evenings: 'Hot tub',
    arrivalWindow: '5:00 PM',
    earlyLate: '11:00 AM',
    allergies: 'Nuts',
    coffeeStyle: 'Drip',
    dogs: '2 large dogs',
    cell: '000-000-0000',
    codeRecipients: 'a second phone',
  }).join('\n');
  assert.match(card, /Hot tub/);
  assert.match(card, /Arrival around 5:00 PM/);
  assert.match(card, /Nuts/);
  assert.equal(card.includes('The river'), false);
  assert.equal(/sauna|fire pit|dog|000-000-0000|second phone/i.test(card), false);
  assert.match(preferenceCardNote(2), /preference card/);
  assert.match(preferenceCardNote(0), /no preference card yet/);
  assert.equal(preferenceCardLines('ranch', null).length, 0);
  const pets = preferencePetLine();
  // No house publishes a pet rule, so the phone points the guest at a person instead of narrating the gap.
  assert.match(pets, /not covered in the published guide/i);
  assert.match(pets, /ask us before you book/i);
  assert.match(pets, /Nothing is sent/);
  assert.equal(pets.includes('$'), false);
});

test('preference party count follows adults and children on the form', () => {
  assert.deepEqual(preferencePartyCount({ adults: '18', children: '2' }), { guests: 20, children: 2 });
  assert.deepEqual(preferencePartyCount({ adults: '26' }), { guests: 26 });
  assert.equal(preferencePartyCount({ adults: '0' }), null);
  assert.equal(preferencePartyCount(null), null);
});
