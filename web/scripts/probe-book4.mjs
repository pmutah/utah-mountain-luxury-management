const b = 'https://wilhite-portfolio.pages.dev';

/*
 * The very first probe today (book-1794098434179-v4sq08) was saved successfully at ~13:35 UTC with
 * guests:6. Its body also carried a `note`. Every failing probe since has had no note. That is the one
 * difference I have not isolated, so try it directly both ways on identical dates.
 */
const base = {
  propertyId: 'ranch',
  checkIn: '2027-01-10',
  checkOut: '2027-01-13',
  name: 'E',
  email: 'e@f.com',
  guests: 6,
};

const cases = [
  ['with note', { ...base, note: 'Diagnostic probe. Safe to decline.' }],
  ['without note', { ...base }],
];

for (const [label, body] of cases) {
  const res = await fetch(`${b}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(
    label.padEnd(14),
    res.status,
    /Worker threw exception/.test(text) ? 'CRASH' : text.slice(0, 160).replace(/\n/g, ' '),
  );
}
