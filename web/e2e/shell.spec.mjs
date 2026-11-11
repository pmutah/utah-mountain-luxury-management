/**
 * Browser harness for the shell. Run from web/ after Playwright is installed:
 *   npx playwright test --config e2e/playwright.config.mjs
 * The always-on regression is src/lib/platform/platform.test.ts, which reads the same routes and selectors.
 */
import { chromium } from 'playwright';

const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto(`${base}/`);
await page.waitForSelector('#root');
const bridge = await page.evaluate(() => typeof window.UML?.navigate === 'function');
if (!bridge) {
  console.error('window.UML.navigate is missing');
  process.exitCode = 1;
}
await page.goto(`${base}/#/market`);
const tab = await page.evaluate(() => document.documentElement.dataset.umlTab || '');
if (!tab) {
  console.error('data-uml-tab was not set');
  process.exitCode = 1;
}
await browser.close();
