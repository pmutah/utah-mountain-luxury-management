import { chromium } from 'playwright';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TOKEN_URL =
  'https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22page%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_routes%22%2C%22type%22%3A%22edit%22%7D%5D&accountId=*&zoneId=all&name=wilhite-portfolio-github-actions';

const outFile = join(tmpdir(), 'cf-token.txt');
const debugShot = join(tmpdir(), 'cf-token-debug.png');
const profileDir = join(tmpdir(), 'cf-chrome-profile-copy');

function prepareProfile() {
  const src = join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'User Data');
  const fallback = join(tmpdir(), 'cf-token-playwright-profile');
  if (!existsSync(src)) return fallback;
  if (existsSync(profileDir)) rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(join(profileDir, 'Default'), { recursive: true });
  const files = ['Local State', 'Default/Cookies', 'Default/Login Data', 'Default/Preferences', 'Default/Secure Preferences'];
  for (const rel of files) {
    const from = join(src, rel);
    const to = join(profileDir, rel);
    if (existsSync(from)) {
      mkdirSync(join(to, '..'), { recursive: true });
      cpSync(from, to);
    }
  }
  return profileDir;
}

async function clickIfVisible(page, patterns) {
  for (const pattern of patterns) {
    const btn = page.getByRole('button', { name: pattern });
    if (await btn.count()) {
      await btn.first().click({ timeout: 8000 });
      return true;
    }
  }
  return false;
}

async function extractToken(page) {
  const loc = page.locator('input[readonly], textarea[readonly], [data-testid="api-token-value"], code');
  const count = await loc.count();
  for (let i = 0; i < count; i += 1) {
    const el = loc.nth(i);
    if (!(await el.isVisible().catch(() => false))) continue;
    const value =
      (await el.inputValue().catch(() => '')) ||
      (await el.textContent().catch(() => '')) ||
      '';
    const trimmed = value.trim();
    if (trimmed.length > 30 && trimmed.length < 120 && !/\s/.test(trimmed)) return trimmed;
  }
  return '';
}

async function main() {
  const userDataDir = join(tmpdir(), 'cf-token-playwright-profile');
  const browser = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    args: ['--profile-directory=Default'],
  });

  const page = browser.pages()[0] ?? (await browser.newPage());
  await page.goto(TOKEN_URL, { waitUntil: 'domcontentloaded', timeout: 120000 });

  const deadline = Date.now() + 90_000;
  let token = '';

  while (Date.now() < deadline) {
    token = await extractToken(page);
    if (token) break;
    if (!/login|sign-in/i.test(page.url())) {
      await clickIfVisible(page, [/Continue to summary/i, /^Continue$/i]);
      await clickIfVisible(page, [/Create Token/i, /Create token/i]);
    }
    await page.waitForTimeout(1200);
  }

  await page.screenshot({ path: debugShot, fullPage: true }).catch(() => {});
  await browser.close();

  if (!token) {
    console.error(`TOKEN_SAVED=0 url=${page.url?.() ?? 'unknown'}`);
    process.exit(1);
  }

  writeFileSync(outFile, token, 'utf8');
  console.log('TOKEN_SAVED=1');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
