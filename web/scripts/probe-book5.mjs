/*
 * Is the 500 specific to the current production build?
 *
 * Cloudflare keeps older deployments reachable on their own hostnames. Same body, same store, different
 * build: if an older deployment answers 200, the fault is in something that shipped recently rather than
 * in data or in the route's design.
 */
const hosts = [
  ['current alias', 'https://wilhite-portfolio.pages.dev'],
  ['build 8267b229', 'https://8267b229.wilhite-portfolio.pages.dev'],
  ['build 756f1cad', 'https://756f1cad.wilhite-portfolio.pages.dev'],
  ['build 4b46a616', 'https://4b46a616.wilhite-portfolio.pages.dev'],
];

const body = {
  propertyId: 'ranch',
  checkIn: '2027-01-10',
  checkOut: '2027-01-13',
  name: 'G',
  email: 'g@h.com',
  guests: 6,
};

for (const [label, base] of hosts) {
  try {
    const res = await fetch(`${base}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    console.log(
      label.padEnd(18),
      res.status,
      /Worker threw exception/.test(text) ? 'CRASH' : text.slice(0, 110).replace(/\n/g, ' '),
    );
  } catch (err) {
    console.log(label.padEnd(18), 'fetch failed:', err.message);
  }
}
