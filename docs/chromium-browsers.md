# Chromium browsers: what changes for a personal unpacked extension

Researched 2026-10-25. Scope: a Manifest V3 extension with one content script, a popup and `storage`, loaded unpacked from a local folder, never published. See [research.md](research.md) for the extension design itself and [plan.md](plan.md) for the build plan.

Short version:

- Every browser below runs MV3 and loads unpacked extensions through a Chrome-style extensions page with a Developer mode switch. The extension doesn't need per-browser code.
- The MV2 phase-out doesn't matter here. We're writing MV3.
- The one real compatibility decision is `browser.*` vs `chrome.*`. `browser.*` only exists on Chromium 148 and later. Forks lag Chrome, Arc is in maintenance mode, and Chrome itself added `browser` only this year. Use `chrome.*` (or a one-line shim) and don't set `minimum_chrome_version` to 148. Details in section 3.
- Developer mode has to stay on. Since Chrome 134, turning it off disables unpacked extensions. Forks inherit this.
- Opera is the odd one out: by default it blocks extensions on search result pages (Google, Bing and other built-in engines) until you tick a per-extension checkbox.
- ChatGPT Atlas doesn't support Chrome extensions, so it's out.

---

## 1. Comparison table

"Chromium base" is what I could confirm for late October 2026. Chrome stable is around 156 under the new two-week cadence.

| Browser | Chromium base (Oct 2026) | MV3 | Extensions page | Dev mode + Load unpacked | Persists across restarts | Warnings / quirks that affect us | `browser.*` available? |
|---|---|---|---|---|---|---|---|
| Google Chrome | ~156 (stable) | Full. MV2 gone. | `chrome://extensions` | Yes, toggle top right | Yes, while Dev mode stays on | Unpacked extensions disabled if Dev mode is turned off (134+). `--load-extension` flag ignored in branded Chrome (137+). | Yes (148+) |
| Arc | ~149 (unverified, last confirmed 144 in official notes) | Yes | Arc menu > Extensions > Manage extensions (Chrome-style page) | Yes | Yes | Maintenance mode since May 2025, Chromium security updates only. No permanent toolbar: pinned extension icons show in the URL bar or when hovering the sidebar. | Only if base is 148+. Don't rely on it. |
| Dia | 156 (changelog, 2026-10-22) | Yes. MV2 disabled since 1.17.0. | Chrome-style page | Not documented in Dia's changelog or help. Expected to work like Chrome. Test it. | Expected yes | Extensions are "second-class": less tested, user-agent sniffing extensions may misbehave. Extensions and pin state sync per profile (1.29+). | Yes |
| Helium | Tracks Chromium closely (no version stated) | Yes, and still runs MV2 | `chrome://extensions` | Not documented. Expected like Chrome. | Expected yes | Beta. Chrome Web Store traffic proxied through Helium. Ships its own uBlock Origin. | Yes if current |
| Brave | Tracks Chrome stable within days | Yes, plus self-hosted MV2 for 4 ad blockers | `brave://extensions` | Yes | Yes | Extensions off in Private windows unless "Allow in Private" is set. Extensions don't work reliably in Private windows with Tor, and Brave advises against it. A dev-mode warning bubble can hide extension icons on restart (user report). Shields are separate from extensions and don't interfere with content scripts. | Yes |
| Microsoft Edge | Tracks Chrome stable | Yes. MV2 phase-out in progress (warnings now, consumer disable Jan to Apr 2027 per Message Center). | `edge://extensions` | Yes, toggle in left pane | Yes | A "developer mode extensions" notification that Microsoft deliberately won't let you dismiss in Stable. Microsoft suggests Dev/Canary channels to avoid it. | Yes |
| Opera (and Opera GX) | Usually one Chromium version behind Chrome | Yes, MV2 still supported for now | `opera://extensions` (Cmd/Ctrl+Shift+E) | Yes | Yes | **Extensions blocked on search result pages of built-in engines by default.** Fix: tick "Allow access to search page results" on the extension's card. Opera-only behavior. | Yes if base 148+ |
| Vivaldi | Uses Chrome's Extended Stable (even-numbered, 8-week cycle), so lags a bit | Yes. MV2 ending after the 8.1 cycle. | `vivaldi://extensions` (Tools > Extensions) | Yes | Yes | Dev mode toolbar didn't appear in Private windows for one user; enable it in a normal window. Extensions don't run on Vivaldi's own internal pages. | Yes, once on Extended Stable 148+ |
| Ungoogled Chromium | Tracks Chromium | Yes | `chrome://extensions` | Yes. The unpacked route is the normal way to install anything there. | Yes | No Chrome Web Store installs without a helper, which doesn't matter for unpacked. | Yes if current |
| Thorium | ~150 (fork mirror) | Yes, MV2 force-enabled | `chrome://extensions` | Yes | Yes | One-person project, release cadence varies. | Yes if 148+ |
| Perplexity Comet | Chromium-based, version not published | Reported yes | Chrome-style page | Not documented. Expected like Chrome. | Unknown | AI agent features can act on pages. No known conflict with a text rewriter. | Unknown |
| ChatGPT Atlas | n/a | **No Chrome extension support** | n/a | No | n/a | Out of scope. Reports also say OpenAI has retired it. | n/a |

Legend: "Expected" means the browser is Chromium-based and the vendor doesn't document the flow, so the Chrome steps should apply. Mark these as verify-on-first-load in the test matrix.

---

## 2. Things common to all of them

These come from Chromium, so every fork inherits them unless it patches them out.

### 2.1 Loading unpacked

1. Open the browser's extensions page (`chrome://extensions` or the vendor equivalent).
2. Turn on Developer mode.
3. Click Load unpacked, pick the folder that contains `manifest.json`.
4. Pin the icon so the popup is one click away.

The folder must stay where it is. The browser reads files from that path on every start. Moving or deleting it breaks the extension. If the folder is on an external drive that isn't mounted when the browser starts, the extension fails to load until you mount it and click reload.

### 2.2 Developer mode must stay on

Chrome 134 started disabling unpacked extensions when Developer mode is switched off (announced for 133, enforced in 134). The card shows a "requires Developer mode" warning. Turning it back on re-enables the extension. Extensions loaded with `--load-extension` were exempt, but branded Chrome dropped that flag in 137, so for Chrome itself, Developer mode on is the only path.

### 2.3 Restart persistence and warnings

- Unpacked extensions survive restarts as long as the folder exists and Developer mode is on.
- Older Chrome showed a "Disable developer mode extensions" bubble at every start on Windows and Mac. Reports suggest current Chrome no longer shows it. Edge still shows its own non-dismissable notification. Brave users report a similar bubble on restart.
- Unpacked extensions don't auto-update. That's what we want: the code only changes when Ales edits it.

### 2.4 Pages no extension can touch

Content scripts don't run on the browser's internal pages (`chrome://`, `edge://`, `brave://`, `opera://`, `vivaldi://`, `arc://`), the Chrome Web Store, other vendors' add-on stores, other extensions' pages, the built-in PDF viewer, or the New Tab page. That's expected, not a bug to chase.

### 2.5 Content scripts, storage, popup, action

- `content_scripts` with `<all_urls>`, `run_at: document_start`, `all_frames: true` and `match_origin_as_fallback: true` work the same in every fork. `match_origin_as_fallback` needs Chromium 119+.
- `chrome.storage.sync` syncs through the browser's own account system. Chrome syncs via Google. Edge via Microsoft. Brave via its sync chain. Helium and Ungoogled Chromium have no Google sync, so `storage.sync` behaves like local storage there (writes still succeed, nothing leaves the machine). Dia syncs extensions per profile, but I found nothing about whether it syncs `storage.sync` data. Either way, settings for this extension are tiny and losing sync is harmless.
- `action` with `default_popup` works everywhere. What differs is where the icon lives:
  - Chrome, Edge, Brave, Opera, Vivaldi, Helium: the toolbar, behind the puzzle-piece menu until pinned.
  - Arc: no permanent toolbar. Pinned extensions appear in the URL bar or on sidebar hover. Command-E cycles through extensions on macOS. View > Show Toolbar brings a toolbar back.
  - Dia: pinned icons in its toolbar area, pin state synced.
- Incognito / Private windows: extensions are off there by default in every Chromium browser. Turn on "Allow in Incognito" (Chrome, Edge, Arc) or "Allow in Private" (Brave) on the extension's details page if wanted.
- `file://` pages need "Allow access to file URLs" on the details page. Needed for the local test fixture.
- `chrome.dom.openOrClosedShadowRoot` (for closed shadow roots, see research.md 4.3) exists since Chromium 88, so every fork has it.

---

## 3. `chrome.*` vs `browser.*`

Chrome 148 added `browser` as an alias of `chrome` for every extension API, in content scripts and extension pages. Same objects. Both namespaces keep working. Chrome's docs suggest new extensions set `minimum_chrome_version: "148"` and use `browser` directly.

For this project that advice is the wrong default:

- `minimum_chrome_version` refers to the Chromium version. Arc's last officially documented base was 144. Third-party trackers report 149 in June 2026, but Arc only gets security updates now and could fall behind again. Vivaldi runs on Extended Stable. A browser below the minimum refuses to load the extension at all.
- `chrome.*` in MV3 already returns Promises for `storage`, `tabs` and the rest. We gain nothing from `browser.*` except the name.
- Firefox and Safari are out of scope, so cross-engine portability doesn't apply either.

Recommendation: write `chrome.*` everywhere and leave `minimum_chrome_version` at something low that reflects real requirements, such as `"119"` for `match_origin_as_fallback`. If you'd rather write `browser.*`, add the shim Chrome's docs give at the top of each script:

```js
globalThis.browser ??= chrome;
```

This is a change from [research.md](research.md) section 1.2, which recommended `browser.*` with a 148 minimum before the fork check.

---

## 4. What could break an em-dash hider in each browser

| Browser | Risk | Severity | What to do |
|---|---|---|---|
| All | Developer mode turned off by accident or by a policy | Extension silently disabled | Leave it on. Check the extensions page when dashes reappear. |
| All | Project folder moved, renamed, or on an unmounted volume | Extension fails to load at startup | Load from a stable path on an internal disk. |
| All | `minimum_chrome_version` higher than the fork's base | Extension won't install | Keep the minimum low, use `chrome.*`. |
| All | Private windows | Dashes visible there | Enable "Allow in Incognito/Private" if wanted. |
| Opera | Search result pages blocked by default | Dashes remain on Google/Bing results | Tick "Allow access to search page results". |
| Arc | No visible toolbar | Popup is hard to reach | Pin the extension, or use Command-E. |
| Arc | Frozen on an old Chromium | New APIs may be missing | Only use APIs from Chromium 119 or older. All APIs in research.md qualify. |
| Dia | Extension support gets less testing | Odd popup or pinning bugs | Test on first load. Dia's changelog shows past pinned-icon bugs (fixed in 1.17.0). |
| Edge | Persistent dev-mode notification | Annoyance only | Ignore it, or use Edge Dev/Canary. |
| Brave | Tor windows | Extension won't run | Expected. Brave discourages extensions there. |
| Helium, Ungoogled | No account sync | Settings don't follow you between Macs | Expected. Load and configure the extension on each machine. |
| Atlas | No extension support | Can't use it at all | Out of scope. |

Nothing on this list needs code that branches per browser. The fixes are all settings or a manifest default.

---

## 5. Sources

Official:

- Chrome, `browser` namespace from Chrome 148: https://developer.chrome.com/docs/extensions/develop/concepts/browser-namespace
- Chrome, two-week release cycle from September 2026: https://developer.chrome.com/blog/chrome-two-week-release
- Chromium extensions group, unpacked extensions restricted to Developer mode (133/134): https://groups.google.com/a/chromium.org/g/chromium-extensions/c/cTdMVtxxooY
- Chromium extensions group, `--load-extension` removed from branded Chrome 137: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/1-g8EFx2BBY/m/S0ET5wPjCAAJ
- Chromium developer-mode extension policy (older FAQ): https://www.chromium.org/developers/extensions-deployment-faq/
- Microsoft Learn, sideload an extension in Edge: https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading
- Microsoft Support, developer mode extension notification (not dismissable): https://support.microsoft.com/topic/developer-mode-extension-notification-b8c45464-6245-4137-94cb-f478aa6c9ab1
- Microsoft Learn, MV3 migration timeline (some steps TBD): https://learn.microsoft.com/microsoft-edge/extensions-chromium/developer-guide/manifest-v3
- Microsoft 365 Message Center MC1467356, Edge MV2 deprecation: https://mc.merill.net/message/MC1467356
- Opera help, testing and Load unpacked: https://help.opera.com/en/extensions/testing/
- Opera help, content scripts and the search-results restriction: https://help.opera.com/en/extensions/content-scripts/
- Vivaldi tip on installing extensions outside the store: https://vivaldi.com/blog/tips/tip-228
- Brave blog, Manifest V3 and Shields: https://brave.com/blog/brave-shields-manifest-v3/
- Arc help, extensions (import, pin, open): https://resources.arc.net/hc/en-us/articles/19434259167767-Extensions-in-Arc-How-to-Import-Add-Open
- Arc release notes: https://resources.arc.net/hc/en-us/articles/20498293324823-Arc-for-macOS-2024-2026-Release-Notes
- Dia changelog (Chromium bumps, MV2 removal, extension sync): https://www.diabrowser.com/changelog
- Helium site: https://helium.computer and repo: https://github.com/imputnet/helium

Secondary (used where no vendor doc exists, treat with care):

- Arc maintenance status and versions: https://supasidebar.com/blog/arc-browser-status-tracker, https://en.wikipedia.org/wiki/Arc_(web_browser)
- Dia extension support notes: https://www.superchargebrowser.com/library/dia-browser-vs-chrome-extensions/
- Chrome 134 Developer mode enforcement in practice: https://underpassapp.com/news/2025/3/3.html
- Opera search-results block, background: https://www.ghacks.net/2019/01/23/opera-blocks-ad-blockers-on-search-page-results-now-fix-inside/
- Brave Tor windows and extensions: https://community.brave.com/t/allow-extension-to-run-in-private-tor-window/615706
- Brave dev-mode warning on restart: https://community.brave.app/t/developer-extension-warning-prevents-extensions-from-appearing-in-toolbar/35407
- Vivaldi MV2 end, 2026: https://piunikaweb.com/2026/07/13/vivaldi-ublock-origin-mv2-extensions-clarification/
- Vivaldi Extended Stable policy: https://www.pcwelt.de/article/1807670/sicherheits-updates-fur-chromium-basierte-browser-chrome-edge-brave-opera-vivaldi.html
- Helium MV2 and bundled uBlock: https://pasqualepillitteri.it/en/news/14572/helium-browser-chromium-without-google
- Ungoogled Chromium extension install: https://github.com/NeverDecaf/chromium-web-store
- Thorium M150 release: https://newreleases.io/project/github/gz83/thorium/release/M150.0.7871.101
- Comet extension support: https://www.igeeksblog.com/perplexity-comet-ai-powered-browser/
- Atlas lacks Chrome extension support: https://blog.logrocket.com/?p=209582

Not verified, and worth checking on first load: Developer mode and Load unpacked in Dia, Helium and Comet; Arc's current Chromium base; whether Dia syncs `storage.sync` data.
