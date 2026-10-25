// End-to-end check in a real browser: loads extension/ into Playwright's
// bundled Chromium (branded Chrome ignores --load-extension), serves the
// fixture over http, and drives the popup.
// Usage: npm run test:e2e        (add HEADED=1 to watch it)
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const extensionPath = join(root, 'extension');
const D = '\u2014';

// Unpacked extension IDs come from the folder path: sha256, first 32 hex
// digits, each mapped 0-f to a-p.
const extensionId = [...createHash('sha256').update(extensionPath).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const path = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!path.startsWith(root)) throw new Error('outside root');
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const fixtureUrl = `http://127.0.0.1:${server.address().port}/test/fixture.html`;

const userDataDir = await mkdtemp(join(tmpdir(), 'emdash-e2e-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: !process.env.HEADED,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

let failures = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail && !ok ? `: ${detail}` : ''}`);
};

/** Popup page whose "active tab" is the fixture tab, as when opened from the toolbar. */
async function openPopup() {
  const popup = await context.newPage();
  await popup.addInitScript((url) => {
    const realQuery = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async () => {
      const me = await chrome.tabs.getCurrent();
      const tabs = await realQuery({});
      const target = tabs.find((t) => t.id !== me?.id);
      return target ? [{ ...target, url }] : [];
    };
  }, fixtureUrl);
  await popup.setViewportSize({ width: 320, height: 480 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForFunction(() => document.getElementById('status').textContent !== 'Loading');
  return popup;
}

async function waitForFixture(page) {
  await page.waitForFunction(() => window.fixtureResults, null, { timeout: 15000 });
  return page.evaluate(() => window.fixtureResults);
}

try {
  // 1. Fixture checks.
  // Reuse the window's initial tab, so the popup stub below finds exactly one other tab.
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(fixtureUrl);
  const results = await waitForFixture(page);
  for (const r of results) check(r.name, r.ok, `got ${JSON.stringify(r.actual)}`);

  // 2. Timing of the first pass on a heavier page: 20,000 paragraphs.
  const start = Date.now();
  await page.evaluate((D) => {
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 20000; i++) {
      const p = document.createElement('p');
      p.className = 'heavy';
      p.textContent = `Heavy ${i}${D}row`;
      frag.append(p);
    }
    document.body.append(frag);
  }, D);
  await page.waitForFunction(
    (D) => ![...document.querySelectorAll('.heavy')].some((p) => p.textContent.includes(D)),
    D,
    { timeout: 10000 },
  );
  const ms = Date.now() - start;
  check(`20,000 added paragraphs rewritten (${ms} ms)`, ms < 3000);

  // 3. Popup: disable this site. The popup reloads the tab.
  const popup = await openPopup();
  await popup.screenshot({ path: join(tmpdir(), 'emdash-popup.png') });
  check('popup shows the host', (await popup.textContent('#site-label')) === 'On 127.0.0.1');
  await Promise.all([page.waitForEvent('load'), popup.click('#site-row')]);
  await page.waitForTimeout(1500);
  const firstLine = await page.textContent('[data-expect^="Spaced"]');
  check('disabled site is left alone after reload', firstLine.includes(D), firstLine);

  // 4. Re-enable the site, then switch the style to en dash.
  await popup.reload();
  await popup.waitForFunction(() => document.getElementById('status').textContent !== 'Loading');
  await Promise.all([page.waitForEvent('load'), popup.click('#site-row')]);
  await page.waitForTimeout(1500);
  check('re-enabled site is rewritten', (await page.textContent('[data-expect^="Spaced"]')) === 'Spaced: one, two');
  await Promise.all([page.waitForEvent('load'), popup.click('input[value="endash"]')]);
  await page.waitForTimeout(1500);
  const endash = await page.textContent('[data-expect^="Spaced"]');
  check('en dash style applies', endash === 'Spaced: one – two', endash);

  // 5. Global switch off.
  await Promise.all([page.waitForEvent('load'), popup.click('label.toggle:has(#enabled)')]);
  await page.waitForTimeout(1500);
  check('global off leaves dashes', (await page.textContent('[data-expect^="Spaced"]')).includes(D));
  check('popup says off', (await popup.textContent('#status')) === 'Off everywhere.');

  // 6. Turning it back on from another tab applies live, without a reload.
  await popup.evaluate(() => chrome.storage.sync.set({ enabled: true, style: 'comma' }));
  await page.waitForFunction(() => document.querySelector('[data-expect^="Spaced"]').textContent === 'Spaced: one, two', null, { timeout: 5000 })
    .then(() => check('turning on applies live', true))
    .catch(() => check('turning on applies live', false));
  await popup.screenshot({ path: join(tmpdir(), 'emdash-popup-final.png') });
} finally {
  await context.close();
  server.close();
  await rm(userDataDir, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
