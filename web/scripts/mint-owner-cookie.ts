/**
 * Write a signed owner session to a file so a shell can pass it to curl without re-encoding it.
 * Test helper only. Never pointed at production.
 */
import { writeFileSync } from 'node:fs';
import { signSession } from '../functions/_lib/email-session.ts';

const [secret, email, out] = process.argv.slice(2);
if (!secret || !email || !out) {
  console.error('usage: tsx scripts/mint-owner-cookie.ts <secret> <email> <outfile>');
  process.exit(2);
}
const value = signSession(email, secret);
writeFileSync(out, value, 'utf8');
process.stdout.write(`${value.length} chars written to ${out}\n`);
