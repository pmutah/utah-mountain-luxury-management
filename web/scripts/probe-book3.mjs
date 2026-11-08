const b = 'https://wilhite-portfolio.pages.dev';

/*
 * The first probe today (Jan 10-13) SAVED successfully with guests:6 and still sits in the inbox.
 * So guests worked at ~13:35 UTC. These runs ask whether something changed since, and whether the
 * failure depends on the dates (a quote path) rather than on guests at all.
 */
const cases = [
  ['known-good dates (was saved)', 'ranch', '2027-01-10', '2027-01-13'],
  ['ranch Apr', 'ranch', '2027-04-12', '2027-04-14'],
  ['river May', 'river', '2027-05-04', '2027-05-06'],
  ['lindon Jun', 'lindon', '2027-06-07', '2027-06-09'],
];

for (const [label, propertyId, checkIn, checkOut] of cases) {
  const res = await fetch(`${b}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ propertyId, checkIn, checkOut, name: 'D', email: 'd@e.com', guests: 3 }),
  });
  const text = await res.text();
  console.log(
    label.padEnd(30),
    res.status,
    /Worker threw exception/.test(text) ? 'CRASH' : text.slice(0, 100).replace(/\n/g, ' '),
  );
}
