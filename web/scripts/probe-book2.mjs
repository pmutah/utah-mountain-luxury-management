const b = 'https://wilhite-portfolio.pages.dev';

/** Which extra fields cause the crash, holding dates and house fixed. */
const base = {
  propertyId: 'ranch',
  checkIn: '2027-04-12',
  checkOut: '2027-04-14',
  name: 'C',
  email: 'c@d.com',
};

const variants = [
  ['guests only', { guests: 3 }],
  ['children only', { children: 1 }],
  ['phone only', { phone: '8015550100' }],
  ['arrival only', { arrival: '5:00 PM' }],
  ['note only', { note: 'hello' }],
  ['guests + phone', { guests: 3, phone: '8015550100' }],
];

for (const [label, extra] of variants) {
  const res = await fetch(`${b}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...base, ...extra }),
  });
  const text = await res.text();
  console.log(
    label.padEnd(16),
    res.status,
    /Worker threw exception/.test(text) ? 'CRASH' : text.slice(0, 110).replace(/\n/g, ' '),
  );
}
