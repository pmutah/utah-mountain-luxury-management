const b = 'https://wilhite-portfolio.pages.dev';
const question =
  'For the Ranch House in 2026 through November, what is the house profit, and what is Todd share of it? Are those two the same number?';

const login = await fetch(`${b}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ password: '9ohYTj0pPzw4iHbyundZ' }),
});
const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');

const res = await fetch(`${b}/api/agent/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Cookie: cookie },
  body: JSON.stringify({ message: question, sessionId: 'probe-profit-3' }),
});
const json = await res.json();
console.log('status', res.status);
console.log('reply:', String(json.reply).slice(0, 1000));
console.log('tools:', JSON.stringify((json.toolSteps ?? []).map((s) => `${s.tool}:${s.action}`)));
