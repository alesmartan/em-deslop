# Em Deslop: research notes

Goal: a Chrome extension that removes or replaces em dashes (U+2014) in the text of pages you visit.

This file is research only. Nothing is scaffolded yet. Code blocks below are sketches to show the shape of the solution, not final code.

Short version, if you read nothing else:

- One manifest, one content script, one small popup. No background service worker needed.
- The content script walks text nodes with a `TreeWalker`, rewrites `textNode.data` in place, and keeps watching with a `MutationObserver` for content that loads later.
- Replace the character (default `", "` style rules, see section 2.6). Don't try to "hide" it with CSS, because CSS can't target single characters.
- Permissions: `content_scripts` matching `<all_urls>`, plus `storage` and `activeTab`. The install dialog will say it can "read and change all your data on all websites". For an extension that rewrites every page, there is no way around that.
- Stack: plain JavaScript, no bundler, no framework. Vitest + jsdom for tests. Move to WXT only if this grows.

---

## 1. How Chrome extensions work (first-timer guide)

### 1.1 The pieces

An extension is a folder of ordinary web files (HTML, JS, CSS, images) plus a `manifest.json` that tells Chrome what each file is for. Chrome loads that folder and runs the files in different contexts:

| Piece | What it is | Needed here? |
|---|---|---|
| `manifest.json` | Required config file: name, version, permissions, which scripts run where. | Yes |
| Content script | JS (and/or CSS) that Chrome injects into web pages. It can read and change the page's DOM. | Yes, this is the whole extension |
| Popup | A small HTML page that opens when you click the toolbar icon. | Yes, for on/off and "disable on this site" |
| Service worker (background) | Event-driven script with no DOM. Chrome starts it when an event fires and stops it when idle. | No |
| Options page | A full settings page. | Maybe later |

The content script can call a few extension APIs directly (`storage`, `runtime.sendMessage`). Most other APIs (like `tabs`) live in the popup or service worker, and the pieces talk through messages or shared `storage`.

Docs:
- Extension concepts overview: https://developer.chrome.com/docs/extensions/develop
- Content scripts: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Service workers: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers

### 1.2 `chrome.*` vs `browser.*`

Since Chrome 148 every extension API is also available as `browser.*`. It points at the same objects (`chrome.tabs === browser.tabs`), works in content scripts, and `runtime.onMessage` listeners can return a Promise. Chrome's advice for new extensions is to set `"minimum_chrome_version": "148"` and use `browser` directly. Older code and most tutorials still use `chrome.*`, and that keeps working.

https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace

For a personal extension on an up-to-date Chrome, use `browser.*` and set `minimum_chrome_version` to 148.

### 1.3 Loading it unpacked (no store, no account)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick the project folder (the one containing `manifest.json`).
4. Pin the icon from the puzzle-piece menu so the popup is one click away.

https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world

That's all you need to use it yourself, forever. Publishing is optional.

### 1.4 Dev loop

After you edit a file, what you have to reload depends on what you changed (from the Hello World tutorial):

| Changed | What to do |
|---|---|
| `manifest.json` | Click the reload icon on the extension card |
| Service worker | Reload extension |
| Content script | Reload extension, then refresh the web page |
| Popup / options HTML or JS | Nothing, just reopen it |

Where logs go (https://developer.chrome.com/docs/extensions/get-started/tutorial/debug):

- **Content script:** open DevTools on the web page, then in the Console switch the context dropdown from `top` to your extension's name. Content script errors do not show on `chrome://extensions`.
- **Popup:** right-click inside the open popup, choose Inspect.
- **Service worker:** "Inspect views" link on the extension card. Leaving its DevTools open keeps the worker alive, which hides lifecycle bugs.
- **Errors button:** appears on the extension card for runtime errors and `console.error`/`console.warn`. Click "Clear all" after fixing.

A practical loop: keep `chrome://extensions` in one tab and a test page in another. Edit, click reload, refresh the test page. A local `test-page.html` full of em dashes, inputs, code blocks and an iframe makes this fast (see section 5).

### 1.5 Publishing basics (optional)

1. Register a Chrome Web Store developer account and pay the one-time fee. The official page doesn't print the amount. It has historically been US$5 (confirm on the dashboard). https://developer.chrome.com/docs/webstore/register
2. Zip the extension folder (the manifest at the zip's root).
3. In the Developer Dashboard click "Add new item" and upload the zip.
4. Fill the **Store listing** tab (description, icon, screenshots).
5. Fill the **Privacy** tab: declare a single purpose ("Removes em dash characters from web page text") and state that no user data is collected or sent anywhere.
6. Fill **Distribution**: which countries and which users can see it. You can keep it unlisted or limit it to testers instead of public.
7. Submit for review. After approval you have 30 days to publish before it reverts to a draft. "Defer publish" lets you pick the moment.

https://developer.chrome.com/docs/webstore/publish
https://developer.chrome.com/docs/webstore/program-policies (policies, including single purpose)

Expect a slower review because of `<all_urls>`: the match patterns doc says extensions with that pattern may take longer to review. https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns

---

## 2. Mutating page text safely

### 2.1 Walk text nodes, not HTML

Never do `document.body.innerHTML = document.body.innerHTML.replace(...)`. It destroys every element, event listener and framework binding on the page, and it can run injected markup.

Instead, visit each `Text` node and change its `data` (same thing as `nodeValue`). A `TreeWalker` is the built-in, fast way to iterate them:

```js
const EM_DASH = '\u2014';

function processSubtree(root) {
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          // REJECT skips the element and everything inside it.
          return shouldSkipElement(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        }
        return node.data.includes(EM_DASH) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    },
  );
  const hits = [];
  while (walker.nextNode()) hits.push(walker.currentNode);
  for (const textNode of hits) textNode.data = replaceDashes(textNode.data);
}
```

Details that matter:

- Showing elements as well as text lets the filter return `FILTER_REJECT` on a `<pre>` or a `contenteditable` and skip the whole subtree in one step. With `SHOW_TEXT` alone you'd have to check every text node's ancestors.
- Collect first, then mutate. Changing nodes while the walker is moving is legal for `data` changes but collecting is easier to reason about.
- `includes('\u2014')` is a cheap prefilter. Most text nodes have no em dash and cost almost nothing.
- Only assign `data` when the value actually changes. That matters for the observer loop below.
- Changing `data` keeps the same node object, so React, Vue and friends don't notice anything structural. Wrapping dashes in new `<span>`s would add nodes the framework doesn't own, which can cause "removeChild" errors or the framework re-rendering the dash back.

MDN refs: https://developer.mozilla.org/en-US/docs/Web/API/TreeWalker, https://developer.mozilla.org/en-US/docs/Web/API/Document/createTreeWalker

### 2.2 What to skip

Skip an element (and its subtree) when any of these hold:

| Skip | Why |
|---|---|
| `SCRIPT`, `STYLE`, `NOSCRIPT`, `TEMPLATE` | Not visible text. Editing script text can break the page. (`<template>` content is a separate fragment that the walker doesn't enter anyway.) |
| `TEXTAREA`, `INPUT`, `SELECT` | User input. `<input>` has no text nodes, its text is the `value` property. `<textarea>` has a text node holding the default value, and rewriting it alters what you type or submit. |
| `isContentEditable` is true | Rich text editors (Gmail compose, Notion, CMS editors). Rewriting under the user's cursor fights the editor and can change what gets saved. |
| `CODE`, `PRE`, `KBD`, `SAMP`, `VAR` | Code samples where the exact character might matter. Make this a setting, default skip. |
| Known editor roots: `.CodeMirror`, `.cm-editor`, `.monaco-editor`, `.ace_editor` | Code editors built from divs rather than `contenteditable`. |
| An opt-out marker, e.g. `[data-emdash-keep]` | Escape hatch for your own pages and tests. |

`contenteditable` content is skipped by checking `element.isContentEditable` in `acceptNode`. That property inherits, so it catches children of an editable root.

Things you can't reach at all, and should not try to: text drawn on `<canvas>` (Google Docs, Figma), text inside images, PDFs in Chrome's viewer, and pages Chrome blocks for extensions (`chrome://` pages, the Chrome Web Store, other extensions' pages).

Optional extras, for later: `document.title` (lives in `<head>`, so walking `body` misses it) and attributes users read, like `title`, `alt`, `placeholder`, `aria-label`. Keep v1 to body text plus `document.title`.

### 2.3 Dynamic and SPA content: `MutationObserver`

Pages keep changing after load: infinite scroll, client-side routing, comments loading, React updating a text node in place. A `MutationObserver` reports those changes:

```js
const pending = new Set();
let scheduled = false;

const observer = new MutationObserver((records) => {
  for (const r of records) {
    if (r.type === 'characterData') pending.add(r.target);
    else for (const n of r.addedNodes) pending.add(n);
  }
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(flush); // batch: one pass per frame at most
  }
});

function flush() {
  scheduled = false;
  for (const node of pending) {
    if (!node.isConnected) continue;
    if (node.nodeType === Node.TEXT_NODE) processTextNode(node);
    else if (node.nodeType === Node.ELEMENT_NODE) processSubtree(node);
  }
  pending.clear();
}

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true, // catches frameworks editing text in place
});
```

Points:

- **No infinite loop**, as long as you only write when the text changes. Your own write fires one `characterData` record. On the next pass that node no longer contains an em dash, so nothing is written and nothing fires again.
- **`characterData: true` is required.** React, for example, updates a text node's value instead of replacing the node. Without it, a live counter or chat message that gains an em dash after first render would slip through.
- **Don't observe attributes.** That's the noisiest record type and you don't need it in v1.
- **Batch.** A busy page can fire thousands of records a second. Collecting into a `Set` and flushing once per animation frame keeps the cost bounded. A text node that is both "added" and "changed" is handled once.
- **Process the parent of an ancestor only once.** If you add both a node and its child to `pending`, processing both is harmless, just redundant. Fine for v1.
- **Before flush, check the filter again.** A node added inside a `contenteditable` or `<pre>` has to be rejected too. `processTextNode` should walk up to the nearest skippable ancestor (or use `node.parentElement.closest(SKIP_SELECTOR)` plus an `isContentEditable` check).

MDN: https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver

### 2.4 Timing and the "flash"

If the script runs after the page has painted, you'll briefly see the em dashes, then they vanish. Options:

- `run_at: "document_idle"` (default): simplest, page is fully parsed, one `processSubtree(document.body)` then start observing. A short flash is possible on slow pages.
- `run_at: "document_start"`: start the observer on `document.documentElement` before the body exists. The parser's insertions show up as `childList` records, so text is fixed close to when it's inserted. Then run one full pass on `DOMContentLoaded` as a safety net, because the parser can append to a text node it already inserted, and a full pass is cheap.

Recommendation: `document_start` + observer + full pass on `DOMContentLoaded`. It's barely more code and avoids the flash. If it causes trouble on some site, fall back to `document_idle`.

### 2.5 Performance notes

- The prefilter (`includes`) and subtree rejects make the full pass fast. Text node counts on heavy pages are in the tens of thousands. Iterating that is milliseconds.
- Precompile the regex once at module level.
- Don't read layout (`getComputedStyle`, `offsetWidth`) in the filter. That forces reflow per node and is the main way this sort of script gets slow. `isContentEditable` and `closest()` don't need layout.
- `requestAnimationFrame` doesn't fire in background tabs. That's fine: work waits until the tab is visible. If you'd rather catch up immediately, use `setTimeout(flush, 0)` or `queueMicrotask`.
- If the page is huge (a 50k-line log viewer), you could split the first pass with `requestIdleCallback`. Probably not needed. Measure first with the DevTools Performance panel.

### 2.6 Replace vs hide, and what to replace with

**CSS alone can't do it.** CSS has no selector for a character inside a text node. `::first-letter` is the only character-level pseudo-element. The one CSS trick is an `@font-face` with `unicode-range: U+2014` that maps the em dash to an empty glyph, but it only applies where that font is first in the element's `font-family`. To force it everywhere you'd override every site's font stack. Not worth it.

**Hiding with markup** (wrap each dash in `<span style="display:none">`) is reversible, but it adds nodes the page didn't create, conflicts with frameworks (see 2.1), costs more DOM, and copy/paste still behaves oddly. Not recommended.

**Replacing the text** is simplest and cheapest. Trade-offs to know about:

- Copying text from the page copies the replaced version.
- It doesn't affect what you type or submit, because inputs and editors are skipped.
- To undo on a page, reload it with the extension off. Optionally keep a `WeakMap<Text, string>` of original values so the popup's "off" switch can restore live, but that's a v2 nicety.

**What to put in its place.** Just deleting the character gives "wordword" for unspaced dashes, which is worse than the dash. A small rule set handles the common cases. In this table `\u2014` stands for the em dash character itself:

| Input | Output | Rule |
|---|---|---|
| `word\u2014word` or `word \u2014 word` | `word, word` | Dash between word characters becomes comma + space. |
| `1990\u20142000` | `1990-2000` | Between digits, use a hyphen (or en dash `–` if you prefer). |
| `\u2014 Author Name` at start of a text node | `Author Name` | Leading dash (quote attribution, list bullets) is dropped. |
| `trailing\u2014` at end of a text node | `trailing` | Trailing dash is dropped. |
| `a\u2014, b` / `\u2014.` | `a, b` / `.` | If punctuation already follows, just drop the dash and its spaces. |

Edge case: the "start/end of a text node" check isn't always the start of a line, because inline tags split text (`<b>word</b>\u2014word`). The comma rule still produces a readable result there, so it's fine.

Make the replacement style a popup setting: **comma** (default), **hyphen with spaces** (`" - "`), **en dash**, **remove**. Store it in `storage.sync`.

Related characters you may want to include later, behind a setting: U+2015 horizontal bar, U+2E3A two-em dash, U+2E3B three-em dash, U+FE58 small em dash, U+FE31 vertical em dash. Probably also ASCII `--` in prose, but that one shows up in code and command-line flags, so it's riskier.

Put the replacement logic in a pure function (`replaceDashes(text, style) -> string`) with no DOM access. It's the part with the most edge cases and the easiest part to unit test.

---

## 3. Manifest V3 essentials and permissions

### 3.1 What MV3 means in practice

- The background page is replaced by a service worker that starts on events and stops when idle. Not needed here.
- No remotely hosted code: all JS must ship inside the package. Fine, we have nothing remote.
- APIs return Promises.

https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3
Manifest reference: https://developer.chrome.com/docs/extensions/reference/manifest

### 3.2 Sketch of the manifest

```json
{
  "manifest_version": 3,
  "name": "Em Deslop",
  "version": "0.1.0",
  "description": "Removes em dashes from the text of web pages.",
  "minimum_chrome_version": "148",
  "icons": { "16": "icons/16.png", "48": "icons/48.png", "128": "icons/128.png" },
  "action": { "default_popup": "popup.html" },
  "permissions": ["storage", "activeTab"],
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_start",
      "all_frames": true,
      "match_origin_as_fallback": true
    }
  ]
}
```

Note: with `match_origin_as_fallback: true`, the `matches` paths must be `/*` (the doc says path `"*"`). `<all_urls>` satisfies that. Double-check when building.

### 3.3 Permissions, one by one

| Entry | Why | Install warning |
|---|---|---|
| `content_scripts.matches: ["<all_urls>"]` | Run on every http/https page automatically. | Yes: "Read and change all your data on all websites" |
| `storage` | Save settings and the per-site disable list. Content scripts can read `storage.local` and `storage.sync` directly. | No |
| `activeTab` | When you click the icon, the popup gets the current tab's URL so it can show "Disable on example.com". Lasts until you leave that site. | No |

Not needed: `host_permissions` (manifest-declared content scripts don't require them, they're for programmatic injection, `fetch` from the worker, etc.), `tabs` (`activeTab` already exposes the URL of the tab you clicked from), `scripting` (no programmatic injection in the recommended design).

Docs:
- Declare permissions: https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- activeTab: https://developer.chrome.com/docs/extensions/develop/concepts/activeTab
- Match patterns: https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns
- Permission warnings: https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings
- storage API: https://developer.chrome.com/docs/extensions/reference/api/storage

Note that `file://` pages need the user to switch on "Allow access to file URLs" on the extension's details page, even with `<all_urls>`. Useful for opening a local test page.

### 3.4 Three permission models

| Model | How | Warning at install | UX |
|---|---|---|---|
| **A. On everywhere, opt out per site** (recommended) | Static `<all_urls>` content script. Script reads a `disabledHosts` list from storage and exits early on those hosts. | Broad warning | Works with zero clicks. "Disable on this site" in the popup. |
| B. Opt in per site | No static script. `optional_host_permissions: ["https://*/*", "http://*/*"]` + `scripting`. Popup calls `permissions.request({ origins: [origin] })` (must be inside a click handler), then `scripting.registerContentScripts()` for that origin. | None at install. Chrome asks per site. | You have to enable each site once. More code. |
| C. Click to run | `activeTab` + `scripting`. Clicking the icon runs `scripting.executeScript()` on the current page. | None | Manual on every page load. Doesn't persist. |

The goal is "on websites he visits", which means automatic on all sites, so model A. The broad warning is honest: the extension does read and change every page. Model B is the right call if you ever want to publish it to cautious users, and it can be added later without a rewrite because the content script stays the same.

Refs for model B: https://developer.chrome.com/docs/extensions/reference/api/permissions (requests need a user gesture), https://developer.chrome.com/docs/extensions/reference/api/scripting (`registerContentScripts`, Chrome 96+).

### 3.5 Per-site toggle in model A

- `storage.sync` holds `{ enabled: true, style: "comma", disabledHosts: ["docs.example.com"] }`. Sync quota is about 100 KB total and 8 KB per item, which fits thousands of hostnames.
- Content script on start: read settings. If globally off or `location.hostname` is in `disabledHosts`, do nothing.
- Content script listens to `storage.onChanged`. Turning a site off can reload the tab (simple) or restore from the `WeakMap` (v2).
- Popup: query the active tab, take `new URL(tab.url).hostname`, show a checkbox.
- Inside iframes, check the top-level site too, or decide that the toggle applies to each frame's own hostname. Simplest: each frame checks its own `location.hostname`. Revisit if a disabled site embeds frames you still see dashes in.

---

## 4. Content scripts in depth

### 4.1 Isolated world

Content scripts share the page's **DOM** but not its **JavaScript**. The page can't see your variables or functions, you can't see the page's, and you each get your own copy of built-ins like `Array.prototype`. Other extensions are isolated from you too. That's why rewriting text nodes from a content script is safe: you touch the DOM and nothing else.

The `world` key defaults to `"ISOLATED"`. `"MAIN"` runs in the page's own JS context (subject to the page's CSP). You don't need `MAIN` for v1.

https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts

### 4.2 `content_scripts` keys you'll care about

From https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts:

| Key | Default | Use here |
|---|---|---|
| `matches` | required | `["<all_urls>"]` |
| `js` / `css` | one required | `["content.js"]` |
| `exclude_matches` | none | Hard-coded sites to never touch, if any. |
| `run_at` | `document_idle` | `document_start` (see 2.4). Values: `document_start`, `document_end`, `document_idle`. |
| `all_frames` | `false` | `true`, so embedded articles, comment widgets, and the like are covered. Each frame gets its own copy of the script. |
| `match_about_blank` | `false` | Superseded by the next key. |
| `match_origin_as_fallback` | `false` | `true`: also run in `about:blank`, `srcdoc`, `blob:` and `data:` frames, using the origin of the frame that created them. Many sites build comment boxes and ads this way. |
| `world` | `ISOLATED` | Leave default. |

### 4.3 Shadow DOM caveats

Web components put their content in shadow roots. Neither `TreeWalker` nor `MutationObserver` crosses into a shadow root, so text inside one is invisible to the code in section 2. Sites built with web components (YouTube, Reddit's newer UI, Salesforce, many design systems) will show untouched dashes until this is handled.

What to do:

1. **Open shadow roots.** While walking, when an element has `element.shadowRoot`, call `processSubtree(element.shadowRoot)` and attach a separate `MutationObserver` to that root (same options). Track observed roots in a `WeakSet` to avoid doubles.
2. **Closed shadow roots.** `element.shadowRoot` returns `null`. Chrome's `chrome.dom.openOrClosedShadowRoot(element)` (Chrome 88+) returns open or closed roots for extensions. https://developer.chrome.com/docs/extensions/reference/api/dom
3. **Roots attached later.** If a component calls `attachShadow()` after its host element was already processed, no mutation record says so. Options, simplest first: re-scan a subtree when its children change; periodically rescan known custom elements (any tag with a `-` in its name); or patch `Element.prototype.attachShadow` from a `MAIN` world script, which is the thorough but invasive fix. Leave the third out of v1.

So the walker's element branch needs one more step: look for a shadow root, and walk and observe it too. That's maybe 15 lines. Put it in v1, since many big sites use shadow DOM.

### 4.4 Frames

With `all_frames: true` the script runs in every frame whose URL matches, including cross-origin frames, and each copy is independent. No message passing needed: each frame fixes its own text. Frames the extension can't run in (another extension's page, a Chrome-internal page) stay untouched.

---

## 5. Recommended stack

### 5.1 Options compared

| Option | What you get | Cost for this project |
|---|---|---|
| **Plain JS, no build** | Edit file, reload extension. The folder is the extension. | Nothing to install. Fewer guardrails (no types unless you opt in). |
| Plain TS + `tsc` | Types. | A compile step and an output folder to load. Small. |
| Vite + CRXJS plugin | Bundling, HMR for popup. | Plugin config for a two-file project. |
| **WXT** (v0.21.x) | File-based entrypoints, TypeScript by default, generates the manifest, fast reload for content scripts, builds for Chrome/Firefox/Edge/Safari, zips and submits to stores, Vitest plugin with a fake `browser` API. | Learning WXT's conventions on top of Chrome's. Generated manifest hides what's actually going on. |
| Plasmo | React-first framework. | Development has slowed: third-party reports put the last release around September 2025 with a growing issue backlog. Not recommended for new work. |

Sources: https://wxt.dev/, https://wxt.dev/guide/essentials/unit-testing.html, https://extensionbooster.net/blog/plasmo-alternatives-chrome-extension-framework-migration-guide-2026.md (a vendor blog, so confirm on https://github.com/PlasmoHQ/plasmo/releases).

### 5.2 Recommendation: plain JavaScript, no build step

For a first extension with one content script and a tiny popup, I'd skip frameworks:

- You learn the real platform. Every concept in the Chrome docs maps one-to-one to a file you wrote. Debugging stays simple: the code in DevTools is your code, no source maps.
- Nothing to break. No `node_modules` needed to run the extension, no compile step between editing and reloading.
- The code will be about 200 lines. WXT pays for itself with several entrypoints, a UI framework, or multiple browsers. None of those apply.
- Types: add `// @ts-check` at the top of each file and `npm i -D @types/chrome` (or `@types/webextension-polyfill` for `browser.*` typings). VS Code then type-checks plain JS with no build.

Switch to WXT if it grows: options page with a UI framework, Firefox support, or automated store publishing. The core (`replaceDashes`, the walker, the observer) is plain DOM code and moves over unchanged.

### 5.3 Testing

- **Unit tests: Vitest + jsdom.** `npm i -D vitest jsdom`, using `environment: 'jsdom'`. jsdom implements `TreeWalker` and `MutationObserver`, so you can test both the pure `replaceDashes` function and the DOM walker: build a fragment with a `<pre>`, a `contenteditable`, an `<input>`, plain paragraphs, and an open shadow root, run `processSubtree`, assert on `textContent`. For observer tests, append nodes and `await` a tick.
  - Content scripts that call `browser.storage` need a stub. Keep storage access in one small module so most code needs no mock.
- **Manual check: `test/fixture.html`**, a local page that covers every case (spaced and unspaced dashes, digits, attributions, code blocks, textarea, contenteditable, open and closed shadow roots, a `srcdoc` iframe, and a button that adds text after 2 seconds to test the observer). Open it via `file://` after enabling file URL access.
- **Then real sites:** a news article, a React SPA (navigate between routes), Gmail compose (must stay untouched), GitHub code view (must stay untouched), YouTube comments (shadow DOM).
- **E2E (optional, later): Playwright.** `chromium.launchPersistentContext` with `--disable-extensions-except` and `--load-extension`, using `channel: 'chromium'`. Google Chrome and Edge removed the flags for side-loading, so this only works with Playwright's bundled Chromium. Headless works in that channel. https://playwright.dev/docs/chrome-extensions

### 5.4 Proposed file list

```
em-deslop/
  manifest.json
  content.js          entry: read settings, initial pass, start observers
  lib/
    replace.js        pure replaceDashes(text, style), no DOM
    walk.js           shouldSkipElement, processSubtree, shadow root handling
    observe.js        MutationObserver batching
    settings.js       storage read/write/onChanged wrapper, defaults
  popup.html
  popup.js            global toggle, "disable on this site", replacement style
  popup.css
  icons/16.png 48.png 128.png
  test/
    replace.test.js
    walk.test.js
    observe.test.js
    fixture.html      manual test page
  package.json        dev only: vitest, jsdom, @types/chrome
  vitest.config.js
  README.md
```

One catch with splitting files: manifest-declared content scripts are classic scripts, not ES modules, so `import` doesn't work in them. List the files in order instead, `"js": ["lib/replace.js", "lib/walk.js", "lib/observe.js", "lib/settings.js", "content.js"]`. They run in one shared scope per frame, so later files can call functions from earlier ones. For Vitest, end each `lib/` file with `if (typeof module !== 'undefined') module.exports = { ... }` so tests can `require` it. That guard is ugly but small. Avoiding it is the one real reason to add a bundler later.

The popup is an ordinary extension page, so it can use `<script type="module">` and real imports.

### 5.5 Next steps

1. Write `replaceDashes` with tests for every row in the table in 2.6. Settle the default style.
2. Write the walker with skip rules and shadow root handling, tested in jsdom.
3. Add the observer with batching. Test with the fixture's delayed-content button.
4. Write the manifest, load unpacked, try the fixture page and five real sites.
5. Add `storage` settings and the popup (global toggle, per-site disable, style).
6. Use it for a week. Note sites where something looks wrong and add skip rules.
7. Optional: icons, store listing, publish as unlisted.

Open questions for the owner:

- Default replacement: comma, spaced hyphen, en dash, or delete?
- Should code blocks (`<pre>`, `<code>`) be skipped by default?
- Include related dashes (horizontal bar, two-em dash) or em dash only?
- Personal use only, or publish? Publishing points toward permission model B (3.4).
