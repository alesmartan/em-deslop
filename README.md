# Em Deslop

The em dash (U+2014) is the most obvious tell of AI writing. Em Deslop is a Chrome extension that takes it out of every page you read. `word\u2014word` becomes `word, word` by default. Code blocks, form fields and anything you can type into are left alone.

Manifest V3, plain JavaScript, no build step. Works in any current Chromium browser: Chrome, Arc, Dia, Helium, Brave, Edge, Opera, Vivaldi.

## Install

1. Open the browser's extensions page: `chrome://extensions` (or `arc://`, `brave://`, `edge://`, `opera://`, `vivaldi://`).
2. Turn on **Developer mode**. Leave it on: since Chrome 134, turning it off disables unpacked extensions.
3. Click **Load unpacked** and pick the `extension/` folder in this repo (not the repo root).
4. Pin the icon so the popup is one click away.

To update after pulling changes, click the reload icon on the extension's card, then refresh open pages.

Browser-specific settings, all on the extension's details page or card:

| Browser | Setting |
|---|---|
| All | "Allow in Incognito" (Brave: "Allow in Private") if you want it in private windows |
| All | "Allow access to file URLs" for local files, including `test/fixture.html` |
| Opera | "Allow access to search page results", or it won't run on Google and Bing results |
| Arc | No toolbar: pin the extension to see it in the URL bar, or press Command-E |
| Edge | Shows a permanent "developer mode extensions" notice. Ignore it. |

The install dialog says the extension can "read and change all your data on all websites". It has to, to rewrite every page. It makes no network requests and only stores its own settings.

On the Mac mini, `~/Code` is on the external SSD. If the SSD isn't mounted when the browser starts, the extension fails to load until you mount it and click reload.

## Popup

- **Everywhere**: global on/off.
- **On example.com**: turn it off for one site. Covers subdomains and that site's iframes.
- **Replace with**: comma (`late, too late`), hyphen (`late - too late`), en dash (`late – too late`) or nothing (`late too late`). Digit ranges always become `1990-2000` (en dash style: `1990–2000`).

Turning it on applies live. Turning it off or changing the style reloads the current tab. Other open tabs keep their rewritten text until you reload them.

Settings live in `chrome.storage.sync`, so they follow your browser account where the browser supports sync.

## What it skips

`pre`, `code`, `kbd`, `samp`, `var`, `script`, `style`, `textarea`, `input`, `select`, `contenteditable` editors, `role="textbox"`, CodeMirror, Monaco and Ace editors, and anything inside `[data-emdash-keep]`.

It can't reach text drawn on canvas (Google Docs body, Figma), PDFs in the built-in viewer, or browser pages (`chrome://`, web stores, the New Tab page). Copying text from a page copies the rewritten version.

## How it works

The content script runs at `document_start` in every frame. It walks text nodes with a `TreeWalker`, rewrites `Text.data` in place (no new elements, so React and friends don't notice), and watches for new text with a `MutationObserver`, batched to one pass per animation frame. It also walks open and closed shadow roots. Details in [docs/research.md](docs/research.md).

```
extension/   the folder you load: manifest, content script, lib/, popup, icons, fonts
test/        Vitest unit tests, fixture.html, e2e.mjs
scripts/     icon rendering
docs/        research, browser comparison, build plan
```

## Development

```sh
npm install
npm test            # Vitest + jsdom: text rules, walker, observer, settings
npm run test:e2e    # Playwright's Chromium with the extension loaded: fixture page and popup
npm run icons       # re-render extension/icons/*.png from icon.svg
```

The extension itself needs no `npm install`. `node_modules` is only for tests.

For a manual check, load the extension, enable file URL access, open `test/fixture.html`, and wait three seconds: the page reports how many of its checks pass.

## Docs

- [docs/plan.md](docs/plan.md): build plan, status, testing approach, risks, open questions.
- [docs/research.md](docs/research.md): how Chrome extensions work and how to rewrite page text safely.
- [docs/chromium-browsers.md](docs/chromium-browsers.md): Chrome, Arc, Dia, Helium, Brave, Edge, Opera, Vivaldi and other forks compared for an unpacked MV3 extension.

## Credits

The popup uses Bricolage Grotesque and Hanken Grotesk, both under the SIL Open Font License, bundled in `extension/fonts/`.
