/*
 * The one thing that changed between the successful probe (~13:35 UTC) and every failing one since:
 * the guest guide was OFF for all houses then, and is ON for ranch and river now.
 *
 * The booking route mints a status token and later reads guide state for the portal. If a guide field
 * is missing or the shape differs from what the code expects, that is a plausible Workers-only throw.
 *
 * This compares the two states directly: a house whose app is OFF (lindon) against houses whose app is
 * ON (ranch, river), with guests set.
 */
const b = 'https://wilhite-portfolio.pages.dev';

const body = (propertyId) => ({
  propertyId,
  checkIn: '2027-02-01',
  checkOut: '2027-02-03',
  name: 'H',
  email: 'h@i.com',
  guests: 4,
});

for (const house of ['lindon', 'ranch', 'river']) {
  const res = await fetch(`${b}/api/book`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body(house)),
  });
  const text = await res.text();
  console.log(
    house.padEnd(8),
    res.status,
    /Worker threw exception/.test(text) ? 'CRASH' : text.slice(0, 110).replace(/\n/g, ' '),
  );
}
