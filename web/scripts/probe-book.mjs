const b = 'https://wilhite-portfolio.pages.dev';

const base = {
  propertyId: 'ranch',
  checkIn: '2027-03-08',
  checkOut: '2027-03-11',
  name: 'A',
  email: 'a@b.com',
};

const variants = [
  ['no guests', { ...base }],
  ['guests 0', { ...base, guests: 0 }],
  ['guests 1', { ...base, guests: 1 }],
  ['guests 6', { ...base, guests: 6 }],
  ['guests string 6', { ...base, guests: '6' }],
  ['children 2 only', { ...base, children: 2 }],
];

for (const [label, body] of variants) {
  const res = await fetch(`${b}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const crashed = /Worker threw exception/.test(text);
  console.log(
    label.padEnd(18),
    res.status,
    crashed ? 'CRASH' : text.slice(0, 120).replace(/\n/g, ' '),
  );
}
