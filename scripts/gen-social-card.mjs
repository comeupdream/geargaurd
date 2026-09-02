/* =============================================================================
 * gen-social-card.mjs — render site/social-card.html to site/social-card.png.
 *
 * NOT part of the build. The site has no build step and no dependencies, and
 * this script is not going to be the thing that introduces one: it is run by
 * hand when the card changes, and the rendered PNG is committed. Deploys stay
 * dependency-free.
 *
 *   npm i -D playwright         # or point EXECUTABLE_PATH at any Chromium
 *   node scripts/gen-social-card.mjs
 *
 * 1200x630 at deviceScaleFactor 1 is the size every platform crops from.
 * Twitter/X, Slack, Discord, iMessage and LinkedIn all accept it, and going
 * larger only costs bytes on a preview nobody zooms into.
 * ===========================================================================*/
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const template = resolve(here, '../site/social-card.html');
const out = resolve(here, '../site/social-card.png');

const browser = await chromium.launch(
  process.env.EXECUTABLE_PATH ? { executablePath: process.env.EXECUTABLE_PATH } : {}
);
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1
});
await page.goto('file://' + template, { waitUntil: 'networkidle' });
/* The template loads no webfonts on purpose, but a render that starts before
 * layout settles clips the wordmark — cheap insurance. */
await page.waitForTimeout(300);
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log('wrote', out);
