/*
 * All three guest portals are now live. That widens the surface, so this checks the boundary rather than
 * assuming it held: a guest's token is a credential for ONE stay on ONE house, and it must not carry another
 * house's door code, Wi-Fi password, or guide.
 *
 * It also checks the thing the readiness change could have broken: Lindon is on with **no house notes**, and
 * the page must still withhold the door code until the guest reads the rules.
 */
const b = 'https://wilhite-portfolio.pages.dev';

const login = await fetch(`${b}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: '9ohYTj0pPzw4iHbyundZ' }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

const stays = await fetch(`${b}/api/reservations`, { headers: { Cookie: cookie } }).then((r) => r.json());
const withToken = (stays.reservations ?? []).filter((s) => s.surveyToken && s.propertyId);

function scan(label, value) {
  const text = JSON.stringify(value);
  const findings = [];
  /*
   * Shape-based only. An earlier version of this script hardcoded the River House's real Wi-Fi password as
   * the thing to look for, which put a live secret in the repo — and the project's own secret-scanning test
   * caught it. Any non-empty value in these fields is the leak; the actual string never needs to be written
   * down.
   */
  if (/"doorCode"\s*:\s*"[^"]+"/i.test(text)) findings.push('a door code value');
  if (/"wifiPassword"\s*:\s*"[^"]+"/i.test(text)) findings.push('a Wi-Fi password value');
  if (/"wifiName"\s*:\s*"[^"]+"/i.test(text)) findings.push('a Wi-Fi network name');
  if (findings.length) return `${label}: LEAK — ${findings.join(', ')}`;
  return `${label}: clean`;
}

const seen = new Map();
for (const stay of withToken.slice(0, 6)) {
  const guide = await fetch(`${b}/api/stay-guide/${stay.surveyToken}`).then((r) => r.json());
  seen.set(stay.propertyId, seen.get(stay.propertyId) ?? []);
  seen.get(stay.propertyId).push({ id: stay.id, enabled: guide.enabled });
  console.log(scan(`${stay.propertyId}/${stay.id.slice(0, 18)}`, guide));

  // The guide must not carry another house's identity.
  const name = String(guide.guide?.headline ?? '');
  if (stay.propertyId === 'lindon' && /provo river|hot tub/i.test(name)) {
    console.log(`  WRONG HOUSE: a Lindon stay carries "${name}"`);
  }
}

console.log('');
for (const [house, rows] of seen) {
  console.log(`${house}: ${rows.length} stay(s), enabled ${rows.filter((r) => r.enabled).length}`);
}

// An unknown token must not resolve to somebody else's stay.
const fake = await fetch(`${b}/api/stay-guide/${'a'.repeat(32)}`).then((r) => r.json());
console.log('a made-up token:', JSON.stringify(fake).slice(0, 120));
