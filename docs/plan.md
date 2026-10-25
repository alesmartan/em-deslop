# Build plan: em dash hider

**Status, 2026-10-25: built.** Steps 1 to 6 and 9 are done, with the recommended defaults standing in for the open questions in section 6. Step 7 is done for Chromium only (automated, see `npm run test:e2e`). The other browsers in the matrix still need a manual pass, and step 8 (a week of daily use) hasn't started. See "What changed during the build" below.

Inputs: [research.md](research.md) (how extensions work, the text-rewriting approach) and [chromium-browsers.md](chromium-browsers.md) (what differs across Chrome, Arc, Dia, Helium, Brave, Edge, Opera, Vivaldi).

---

## 1. Goal and scope

A Manifest V3 extension, loaded unpacked, that replaces em dashes (U+2014) in the text of every page Ales visits. Personal use. Works in any current Chromium browser without per-browser code.

In v1:

- Rewrite body text and `document.title`, live, including content that loads later.
- Popup with a global on/off switch, "disable on this site", and the replacement style.
- Skip code, inputs, editors and anything the user types into.

Not in v1: attributes (`title`, `alt`, `aria-label`), related dashes (U+2015, U+2E3A and friends), ASCII `--`, live restore when switching off (reload is fine), Firefox or Safari, store publishing.

---

## 2. Recommended defaults

Taken from [research.md](research.md) unless noted. Each one is a default, and section 6 lists the ones Ales should confirm.

| Area | Default | Why |
|---|---|---|
| Approach | Replace the character in `Text.data`. No CSS hiding, no wrapper spans. | CSS can't target one character. Spans fight React and friends. (research 2.6) |
| Replacement style | `comma`: `word\u2014word` and `word \u2014 word` become `word, word`. Digits get a hyphen (`1990-2000`). Leading and trailing dashes in a text node are dropped. Dash before existing punctuation is dropped. | Plain deletion glues words together. (research 2.6) |
| Other styles | `hyphen` (`" - "`), `endash` (`" – "`), `remove` | Popup setting, stored in `storage.sync`. |
| Skip list | `SCRIPT`, `STYLE`, `NOSCRIPT`, `TEMPLATE`, `TEXTAREA`, `INPUT`, `SELECT`, `CODE`, `PRE`, `KBD`, `SAMP`, `VAR`, any `isContentEditable` element, `.CodeMirror`, `.cm-editor`, `.monaco-editor`, `.ace_editor`, `[data-emdash-keep]` | Don't alter code samples or what the user is typing. (research 2.2) |
| Traversal | `TreeWalker` with `SHOW_ELEMENT \| SHOW_TEXT`, `FILTER_REJECT` on skipped subtrees, `includes('\u2014')` prefilter, collect then mutate, write only when the value changes. | Fast, no infinite observer loop. (research 2.1) |
| Live updates | One `MutationObserver` on `document.documentElement` with `childList`, `subtree`, `characterData`. No `attributes`. Batch into a `Set`, flush once per `requestAnimationFrame`. | SPAs, infinite scroll, React text updates. (research 2.3) |
| Shadow DOM | Walk and observe open shadow roots. Use `chrome.dom.openOrClosedShadowRoot` for closed ones. Track roots in a `WeakSet`. | YouTube, Reddit and design systems hide text there. (research 4.3) |
| Timing | `run_at: document_start`, observer starts immediately, full pass on `DOMContentLoaded`. Fallback: `document_idle`. | Avoids the dash flashing before it's replaced. (research 2.4) |
| Frames | `all_frames: true`, `match_origin_as_fallback: true`. Each frame checks its own hostname against the disable list. | Embedded articles and `srcdoc` comment widgets. (research 4.2, 4.4) |
| Permissions | `content_scripts.matches: ["<all_urls>"]`, `permissions: ["storage", "activeTab"]`. No `host_permissions`, `tabs` or `scripting`. | Smallest set for "on everywhere, opt out per site" (model A). (research 3.3, 3.4) |
| API namespace | `chrome.*` everywhere. `minimum_chrome_version: "119"`. | **Changed from research.md.** `browser.*` needs Chromium 148, and Arc and Vivaldi can lag. (chromium-browsers 3) |
| Stack | Plain JavaScript, no build step, no framework. `// @ts-check` plus `@types/chrome` for editor type checking. | About 200 lines of code. The folder is the extension. (research 5.2) |
| Content script files | Classic scripts listed in order in the manifest (`lib/replace.js`, `lib/walk.js`, `lib/observe.js`, `lib/settings.js`, `content.js`). Each `lib/` file ends with a `module.exports` guard for tests. | Manifest content scripts can't use `import`. (research 5.4) |
| Popup | Plain HTML/CSS/JS, `<script type="module">`. | Extension pages can use modules. |
| Tests | Vitest + jsdom for unit and DOM tests. Manual fixture page. Playwright later, optional. | jsdom implements `TreeWalker` and `MutationObserver`. (research 5.3) |
| Settings shape | `storage.sync`: `{ enabled: true, style: "comma", disabledHosts: [] }` | Fits the 8 KB per item quota easily. (research 3.5) |

File layout as built. The extension lives in `extension/`, so the folder you load doesn't contain `node_modules` or tests:

```
extension/
  manifest.json  content.js
  lib/replace.js  lib/walk.js  lib/observe.js  lib/settings.js
  popup.html  popup.js  popup.css
  icons/icon.svg  icons/16.png 32.png 48.png 128.png
  fonts/          Bricolage Grotesque and Hanken Grotesk for the popup (OFL)
test/
  setup.js  replace.test.js  walk.test.js  observe.test.js  settings.test.js
  fixture.html    manual and automated check page
  e2e.mjs         Playwright run against real Chromium
scripts/icons.mjs renders icon.svg to PNGs
package.json  vitest.config.js   (dev only)
```

### What changed during the build

- **`extension/` subfolder.** research.md put everything at the root. Loading the repo root would have pulled `node_modules` into the extension, and Chrome rejects top-level names starting with `_`.
- **No `module.exports` guard.** The `lib/` files attach to `globalThis.EmDash` inside an IIFE. Vitest imports them for that side effect, so the guard from research 5.4 wasn't needed.
- **Context across inline tags.** A dash at the edge of a text node (`<b>word</b>\u2014word`) looks at the neighbouring inline text to decide between "comma" and "drop". Block elements and `<br>` count as boundaries.
- **Late shadow roots.** Custom elements with no shadow root are rechecked up to 5 times, once a second, while the page is changing. Fixture case: a shadow root attached 300 ms after load.
- **Iframes on a disabled site.** Each frame checks its own host and the top-level page's host (`location.ancestorOrigins`), so disabling a site covers its embeds too.
- **Settings arrive late.** The observer starts at `document_start` and queues records until settings load, then processes them or throws them away.
- **Live on, reload off.** Turning the extension on applies live in every tab. Turning it off or changing the style reloads the current tab, because rewritten text can't be put back yet.

---

## 3. Build steps

Each step ends in a working state and gets its own commit.

### Step 0. Answer the open questions

Ales answers section 6. Update the defaults table if anything changes.

Done when: every question has an answer written into this file.

### Step 1. Project skeleton and test runner

Create `package.json` (dev dependencies only: `vitest`, `jsdom`, `@types/chrome`), `vitest.config.js` with `environment: 'jsdom'`, `.gitignore` with `node_modules/`, and one placeholder test.

Done when:

- `npm test` runs and passes.
- The extension folder still works with no `npm install` (nothing at runtime depends on `node_modules`).

### Step 2. `replaceDashes(text, style)`

Pure function in `lib/replace.js`, no DOM. Regex compiled once at module level.

Done when tests cover, for every style:

- `word\u2014word`, `word \u2014 word`, `word \u2014word`, `word\u2014 word`
- `1990\u20142000` (digits)
- leading `\u2014 Author` and trailing `text\u2014`
- dash followed by punctuation: `a\u2014, b`, `end\u2014.`, `wait\u2014?`
- several dashes in one string, and two dashes in a row (`\u2014\u2014`)
- dash next to quotes and brackets: `"Hello"\u2014she said`, `(see below\u2014)`
- non-Latin text: `слово\u2014слово`, `中文\u2014中文`
- whitespace variants: non-breaking space (U+00A0) and thin space (U+2009) around the dash
- a string with no dash comes back as the identical string (same value, so callers can skip the write)
- the en dash (U+2013) and hyphen are left alone

### Step 3. Walker and skip rules

`lib/walk.js`: `shouldSkipElement`, `processSubtree(root)`, `processTextNode(node)`, shadow root discovery.

Done when jsdom tests show:

- Paragraph text is rewritten. The `Text` node object is the same one (identity check), only `data` changed.
- Every element in the skip list keeps its dash, including nested children (`<pre><span>a\u2014b</span></pre>`).
- A child of a `contenteditable` root is skipped.
- A `<textarea>` default value and an `<input value>` are untouched.
- `[data-emdash-keep]` subtrees are untouched.
- Text inside an open shadow root is rewritten. A shadow root nested inside a shadow root is rewritten too.
- `document.title` is rewritten.
- Running `processSubtree` twice changes nothing the second time.

### Step 4. Observer with batching

`lib/observe.js`: one observer per document and per shadow root, `Set` of pending nodes, flush on `requestAnimationFrame`.

Done when jsdom tests show:

- An appended `<p>` with a dash is rewritten after one frame.
- Changing an existing text node's `data` to include a dash is rewritten (`characterData`).
- A node appended inside `<pre>` or a `contenteditable` is left alone.
- A shadow root attached to a newly added element is walked and observed.
- The extension's own write causes at most one extra observer callback, then stops (no loop). Assert with a callback counter.
- Disconnected nodes in the pending set are ignored without errors.

### Step 5. Manifest, content entry, first load

Write `manifest.json` (as in research 3.2, with `chrome.*`, minimum 119) and `content.js` that runs the walker and starts the observer. Hard-code settings for now. Placeholder icons are fine.

Done when:

- Load unpacked in Chrome succeeds with no errors on the extension card.
- `test/fixture.html` (built in this step, see 4.1) shows no em dashes outside the skip zones, with "Allow access to file URLs" on.
- No visible flash of dashes on the fixture or on a long news article.
- The content script console (context dropdown set to the extension) shows no errors.

### Step 6. Settings and popup

`lib/settings.js` wraps `chrome.storage.sync` with defaults and an `onChanged` listener. `popup.html/js/css` shows: global switch, "Disable on <hostname>" checkbox, style picker. Changing a setting reloads the active tab (live restore is v2).

Done when:

- Turning the global switch off and reloading leaves dashes in place. On again restores the behavior.
- Disabling a site affects only that hostname, survives a browser restart, and the popup shows the right state when reopened.
- Changing the style changes output on the next reload.
- The popup handles pages with no usable hostname (`chrome://`, the New Tab page, `file://`) without throwing, and says the extension can't run there.
- Every clickable control has `cursor: pointer`. No colored accent bars, no amber, no nested cards, no sparkle or robot icons (Ales's UI rules).

### Step 7. Cross-browser pass

Load the same folder in each browser in the matrix (4.3) and run the manual checklist.

Done when every row in the matrix has a result, and any browser-specific setting (Opera's search-results checkbox, private-window toggles) is written into the README.

### Step 8. Live with it for a week

Use it daily. Keep a list in `docs/notes.md` of sites where text looks wrong, dashes survive, or something breaks. Turn each one into a skip rule, a replacement rule, or a known limitation.

Done when a week passes with no new breakage, or every item on the list is fixed or documented.

### Step 9 (optional). Icons and polish

Real icons, a short README section on installing and updating. Publishing stays out of scope unless Ales decides otherwise (see 6).

---

## 4. Testing approach

### 4.1 Manual fixture page: `test/fixture.html`

One local page that covers every case, opened via `file://`:

- Paragraphs with spaced, unspaced and mixed dashes, digit ranges, quote attributions (`\u2014 Author`), dashes before punctuation.
- Inline markup splitting text: `<b>word</b>\u2014word`, `<a>link</a> \u2014 text`.
- `<pre>`, `<code>`, `<kbd>` blocks containing dashes (must stay).
- `<textarea>` with a dash in its default value, `<input value="a\u2014b">` (must stay).
- A `contenteditable` div with dashes (must stay, and typing a dash into it must stay).
- A `data-emdash-keep` block (must stay).
- An open shadow root and a closed shadow root with dashes.
- A `srcdoc` iframe and a same-origin iframe with dashes.
- A button that appends a paragraph with dashes after 2 seconds, and one that changes an existing text node's value.
- A `<title>` containing a dash.
- A very long section (10,000 paragraphs, generated by an inline script) to eyeball performance.

### 4.2 Edge cases to check on real sites

| Case | Example site | Expected |
|---|---|---|
| Long article | Any news site | No dashes, no flash |
| React SPA, route changes | GitHub issues, X/Twitter | New content rewritten after navigation |
| Rich text editor | Gmail compose, Google Docs comments, Notion | Editor content untouched, typing works normally |
| Code view | GitHub file view, Stack Overflow code blocks | Code untouched |
| Code editor | CodeSandbox, VS Code for the Web | Untouched |
| Shadow DOM | YouTube comments, Reddit | Rewritten |
| Infinite scroll | Reddit, Hacker News comment pages | New items rewritten |
| Live-updating text | A chat app or a live blog | Updates rewritten, no runaway CPU |
| Canvas text | Google Docs body, Figma | Dashes remain (known limitation) |
| PDF | Any PDF in the built-in viewer | Dashes remain (known limitation) |
| Search results | Google, Bing | Rewritten (needs the Opera checkbox in Opera) |
| Disabled site | Pick one in the popup | Untouched, including its iframes from the same host |

Watch the DevTools Performance panel on the two heaviest pages. A content script long task over 50 ms is a bug to fix.

### 4.3 Cross-browser matrix

Run the fixture checklist and three real sites (a news article, YouTube, GitHub) in each:

| Browser | Load unpacked works | Fixture passes | Real sites pass | Popup reachable | Survives restart | Browser-specific setting |
|---|---|---|---|---|---|---|
| Chrome | | | | | | Developer mode on |
| Arc | | | | | | Pin icon, or Command-E |
| Dia | | | | | | Verify Dev mode exists |
| Helium | | | | | | Verify Dev mode exists |
| Brave | | | | | | "Allow in Private" if wanted |
| Edge | | | | | | Ignore dev-mode notification |
| Opera | | | | | | "Allow access to search page results" |
| Vivaldi | | | | | | Enable Dev mode in a normal window |

Only the browsers Ales uses day to day are required. The rest are nice to have.

### 4.4 Automated tests

- Unit and DOM tests in Vitest + jsdom run with `npm test` on every change.
- Playwright end-to-end tests are optional and limited to Playwright's bundled Chromium, because branded Chrome and Edge ignore `--load-extension`. Add them only if manual checks start to feel slow.

---

## 5. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rewriting text inside an editor changes what gets saved or sent | Medium | High | Skip `isContentEditable` and known editor roots. Test Gmail and Notion in step 7. Add skip rules as found. |
| Framework re-renders put the dash back, or crash on a changed node | Low | Medium | Only change `data` on existing nodes. `characterData` observation catches re-renders. |
| Observer loop or heavy CPU on busy pages | Low | High | Write only on change, batch per frame, no attribute observation. Performance check in 4.2. |
| Flash of dashes before replacement | Medium | Low | `document_start` plus observer. Fall back to `document_idle` per site if it misbehaves. |
| Comma rule produces bad grammar in some sentences | High | Low | Style setting. Collect bad cases during step 8 and refine the rules. |
| Code-like text outside `<code>` gets changed (docs sites using `<div>` for code) | Medium | Medium | Add site-specific skip selectors as found. `data-emdash-keep` for own pages. |
| Shadow roots attached after processing are missed | Medium | Low | Re-scan subtrees on `childList` changes. The `attachShadow` patch stays out of v1. |
| Developer mode switched off, extension silently disabled | Medium | Medium | Documented in README. Note it in the popup's help text. |
| Folder on the mini's external SSD isn't mounted at browser start | Low | Medium | Documented. Reload from the extensions page after mounting. |
| Copying text from a page copies the replaced version | Certain | Low | Accepted trade-off. Disable on that site when exact text matters. |
| Broad install warning ("read and change all your data") | Certain | Low | Honest for this design. Model B (per-site opt-in) is the path if publishing. |
| A fork lags Chromium or drops an API | Low | Medium | `chrome.*` only, minimum Chromium 119. |

---

## 6. Open questions for Ales

1. **Replacement style default.** Comma (recommended), spaced hyphen, en dash, or delete?
2. **Code blocks.** Skip `<pre>`, `<code>`, `<kbd>` by default (recommended), or rewrite them too, behind a setting?
3. **Related characters.** Em dash only (recommended for v1), or also U+2015, U+2E3A, U+2E3B, U+FE58? And ASCII `--` in prose?
4. **Which browsers matter?** The matrix lists eight. Which ones do you actually use day to day? Those become required, the rest optional.
5. **Namespace.** OK with `chrome.*` and a low minimum version, instead of research.md's `browser.*` with a 148 minimum?
6. **Personal only, or publish later?** Publishing points to permission model B (per-site opt-in) and a store listing. Personal use keeps model A.
7. **Live restore.** Is "reload the page after toggling" acceptable for v1, or do you want dashes to come back instantly when switching off?
8. **Where does the extension folder live?** Loading from `~/Code/em-dash-hider` on the mini means the external SSD must be mounted. Fine, or load from a copy on the internal disk?
9. **Settings sync between Macs.** `storage.sync` follows your browser account. Good enough, or should the disable list live in the repo so both Macs share it through git?
