// Renders the README images with the real extension loaded:
//   docs/images/before-after.png  the "after" text is rewritten by the extension
//   docs/images/popup.png
// Usage: npm run screenshots
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));
const extensionPath = join(root, 'extension');
const out = join(root, 'docs/images');
await mkdir(out, { recursive: true });

const extensionId = [...createHash('sha256').update(extensionPath).digest('hex').slice(0, 32)]
  .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
  .join('');

const D = '—';
const SAMPLE = `Great question${D}and honestly, a pivotal one. The answer isn't just about speed${D}it's about trust. And trust${D}real trust${D}takes time.`;

const page = (sample) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: "Bricolage Grotesque"; font-weight: 700; src: url("/fonts/bricolage-grotesque-700-latin.woff2"); }
@font-face { font-family: "Hanken Grotesk"; font-weight: 400 700; src: url("/fonts/hanken-grotesk-latin.woff2"); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; background: #141414; color: #e9e8e4; font-family: "Hanken Grotesk", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
main { padding: 72px 80px 80px; }
h1 { font-family: "Bricolage Grotesque", system-ui, sans-serif; font-weight: 700; font-size: 104px; line-height: 0.86; letter-spacing: -0.045em; }
.lede { margin-top: 22px; font-size: 22px; color: rgba(233,232,228,0.62); }
.rows { margin-top: 56px; }
.row { display: grid; grid-template-columns: 160px 1fr; gap: 32px; border-top: 1px solid rgba(233,232,228,0.16); padding: 34px 0; }
.row:last-child { border-bottom: 1px solid rgba(233,232,228,0.16); }
.label { font-size: 14px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(233,232,228,0.62); padding-top: 10px; }
.text { font-family: "Bricolage Grotesque", system-ui, sans-serif; font-weight: 700; font-size: 36px; line-height: 1.18; letter-spacing: -0.02em; }
.before .text { color: rgba(233,232,228,0.62); }
</style></head><body><main>
<h1>Em Deslop</h1>
<p class="lede">Takes the em dash out of every page you read.</p>
<div class="rows">
  <div class="row before" data-emdash-keep><span class="label">Before</span><p class="text">${sample}</p></div>
  <div class="row after"><span class="label">After</span><p class="text">${sample}</p></div>
</div>
</main></body></html>`;

// Serve the page and the extension's fonts from one http origin.
const server = createServer(async (req, res) => {
  if (req.url.startsWith('/fonts/')) {
    try {
      res.writeHead(200, { 'content-type': 'font/woff2' });
      res.end(await readFile(join(extensionPath, req.url)));
    } catch {
      res.writeHead(404).end();
    }
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page(SAMPLE));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;

const userDataDir = await mkdtemp(join(tmpdir(), 'emdash-shots-'));
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: 'chromium',
  headless: true,
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
});

try {
  const tab = context.pages()[0] ?? (await context.newPage());
  await tab.setViewportSize({ width: 1200, height: 800 });
  await tab.goto(url);
  await tab.waitForFunction(() => !document.querySelector('.after .text').textContent.includes('—'));
  await tab.evaluate(() => document.fonts.ready);
  await tab.locator('main').screenshot({ path: join(out, 'before-after.png') });

  const popup = await context.newPage();
  await popup.addInitScript(() => {
    const realQuery = chrome.tabs.query.bind(chrome.tabs);
    chrome.tabs.query = async () => {
      const me = await chrome.tabs.getCurrent();
      const target = (await realQuery({})).find((t) => t.id !== me?.id);
      return target ? [{ ...target, url: 'https://example.com/' }] : [];
    };
  });
  await popup.setViewportSize({ width: 320, height: 470 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.waitForFunction(() => document.body.classList.contains('ready'));
  await popup.evaluate(() => document.fonts.ready);
  await popup.locator('main').screenshot({ path: join(out, 'popup.png') });
} finally {
  await context.close();
  server.close();
  await rm(userDataDir, { recursive: true, force: true });
}
console.log(`Wrote ${out}/before-after.png and popup.png`);
