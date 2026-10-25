# Publishing Em Deslop

Researched 2026-10-25. How to get Em Deslop onto the Chrome Web Store, what it costs, what reviewers look at, and what the repo still needs before a first submission. Edge Add-ons and the other stores are covered at the end.

Short version:

- **One store covers almost everyone.** Chrome, Arc, Dia, Helium, Brave, Vivaldi and Opera all install from the Chrome Web Store. Edge users can too, but Edge has its own free store worth a second listing.
- **Cost:** US$5, once, for the whole account (not per extension, no renewal). Plus a Google account with 2-Step Verification and a few hours of work on images and copy. Edge Add-ons is free.
- **Review:** "within a few days" for most extensions, "up to a few weeks" for some. Em Deslop runs on all sites, which Google lists as a reason for a longer, more careful review. Expect the slow end for the first submission.
- **Biggest risks:** the broad host permission and the privacy disclosures. Both are fine if the justifications are specific and the privacy policy matches what the code does.
- **To do in the repo first:** a store-sized icon with padding, 1280x800 screenshots, a 440x280 promo tile, a privacy policy page, a better manifest description, and a zip script. Details in section 6.

---

## 1. Developer account

| Requirement | Detail |
|---|---|
| Google account | Use one you'll keep. The account email can't be changed after registration. A dedicated address is Google's advice. |
| Registration fee | US$5, paid once by card. Covers every extension on the account, no yearly renewal. Google's registration page doesn't print the amount, but Google's 2020 dashboard announcement states $5.00, and 2026 publishing guides agree. The dashboard shows the exact amount before you pay. |
| 2-Step Verification | Required before you can publish or update anything. |
| Contact email | Must be verified in the dashboard's Account page. Notifications go there. |
| Publisher name | Shown as "Offered by" on the listing. |
| Trader or non-trader | Every developer has to declare one under the EU Digital Services Act. Traders get their legal name and contact details shown to EU users. It's a legal judgment you make yourself. A free, open-source side project with no revenue usually reads as non-trader, but Google won't decide it for you. |
| Region | Your country has to be on Google's supported list. |
| Item limit | New accounts can publish 2 extensions. Fine here. |

Optional: verify a domain (for example `alesm.dev`) so the listing shows an official publisher URL.

Sources: [Register](https://developer.chrome.com/docs/webstore/register), [Set up your account](https://developer.chrome.com/docs/webstore/set-up-account), [2-Step Verification](https://developer.chrome.com/docs/webstore/program-policies/two-step-verification), [Trader disclosure](https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure), [Trader FAQ](https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq), [2020 fee announcement](https://blog.chromium.org/2020/03/new-developer-dashboard-and.html), and for the fee in 2026: [Extension Radar](https://www.extensionradar.com/blog/chrome-web-store-developer-fee-2026), [pearpages](https://pearpages.com/blog/2026/07/19/publishing-chrome-extensions-what-it-takes-what-it-costs), [ExtensionLaunch](https://extensionlaunch.com/blog/chrome-web-store-developer-account).

## 2. The submission

In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole): **Add new item**, upload a zip of the `extension/` folder with `manifest.json` at the zip's root, then fill in five tabs.

| Tab | What goes in |
|---|---|
| Package | The uploaded zip. Read-only. |
| Store listing | Description, category, language, icon, screenshots, promo tiles, homepage and support URLs. |
| Privacy | Single purpose, a justification for each permission, remote code (No), data usage checkboxes and certifications, privacy policy URL. |
| Distribution | Free, regions, visibility. |
| Test instructions | Only needed for logins or hidden features. A one-liner pointing at `test/fixture.html` doesn't hurt. |

Then **Submit for review**. Untick "publish automatically" if you want to pick the launch moment. After approval you have 30 days to publish before the submission drops back to draft.

Visibility options, all with the same review:

- **Public:** listed and searchable.
- **Unlisted:** no listing in search, anyone with the link can install. Good for a soft launch with friends.
- **Private:** only trusted testers (emails set at account level) or Google Groups you manage.

Every update needs a higher `version` in `manifest.json` and goes through review again.

Sources: [Publish](https://developer.chrome.com/docs/webstore/publish), [Distribution](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution).

## 3. Images

| Asset | Size | Required | Notes |
|---|---|---|---|
| Store icon | 128x128 PNG, inside the zip | Yes | Artwork 96x96 with 16 px transparent padding per side. Must read on light and dark backgrounds. No edge or big shadow. |
| Screenshots | 1280x800 (preferred) or 640x400 | At least 1, up to 5 | Square corners, full bleed, real UI. Downscaled to 640x400 in the store, so avoid small text. |
| Small promo tile | 440x280 | Optional, but listings without it are shown after those with it | Avoid text, must work at half size, fill the whole area. |
| Marquee tile | 1400x560 | Optional | Only needed to be featured in the store's marquee. |

Our current icon fills 120 of 128 px. It needs a version with the 16 px padding.

Sources: [Images](https://developer.chrome.com/docs/webstore/images), [Listing best practices](https://developer.chrome.com/docs/webstore/best-listing).

## 4. Review and policy

How review works:

- Manual plus automated, the same for everyone. Published items get re-reviewed periodically and after user reports.
- Google names the signals that slow review down: new developer, new extension, "dangerous permission requests", broad host permissions like `<all_urls>`, and large or hard-to-read code. We hit the first three. Our code is small, readable and unminified, which helps.
- No reply after three weeks: contact developer support.
- Rejection comes by email with the policy it broke. The fix is a new submission. Appeals go through the dashboard.

Policies that apply to Em Deslop:

- **Single purpose.** One narrow, easy-to-understand job. Ours qualifies: replace one character in page text. Don't add unrelated features later (word filters, AI detection, a reading mode) without thinking about this.
- **Minimum permissions.** Every permission needs a justification. Ours are `storage`, `activeTab` and the `<all_urls>` content script. All three are needed and easy to explain (drafts in section 5).
- **No remote code.** MV3 forbids it anyway. We load nothing remote. The popup fonts ship in the package.
- **User data.** Google's User Data FAQ lists "website content" as user data and "scraping content from a website" as handling it, and says disclosure applies "even when data is processed or stored locally". Em Deslop reads and rewrites page text on the device and never sends or stores it. That makes a privacy policy required in practice. Whether to tick the "Website content" box is a judgment call: we don't collect anything, so leaving it unticked is accurate, and the privacy policy should spell out the local processing so the two match.
- **Listing honesty.** No keyword stuffing (it can get an item suspended), no superlatives, no naming competitors, and the description has to match what the extension does.

Sources: [Review process](https://developer.chrome.com/docs/webstore/review-process), [Privacy tab](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [User Data FAQ](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), [Quality guidelines FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq), [Program policies](https://developer.chrome.com/docs/webstore/program-policies).

### Should we switch to per-site permissions first?

[research.md](research.md) section 3.4 describes model B: no host access at install, and Chrome asks per site. It avoids the "read and change all your data on all websites" warning and probably speeds up review. It also turns a zero-click extension into one you have to enable site by site, which defeats the point of something that should work on every page you read. Popular extensions that rewrite every page, such as dark mode and font changers, ship with all-sites access and pass review.

Recommendation: keep model A for the first submission, with a clear justification. Revisit only if review pushes back.

## 5. Draft listing copy

These follow the store's rules: plain text, no superlatives, no em dashes (it would be a bit embarrassing).

**Name:** Em Deslop

**Summary** (manifest `description`, 132 characters max):

> Removes em dashes from every page you read. Code, form fields and editors stay untouched. No tracking, no network requests.

That's 123 characters.

**Category:** Productivity. Check the dashboard's current list; "Tools" or "Accessibility" are the other candidates.

**Description:**

> The em dash has become the most recognizable tell of AI writing. Em Deslop replaces it on every page you visit, before the page finishes drawing, so you read the words instead of the punctuation.
>
> How it replaces dashes:
> - Between two words, it becomes a comma.
> - Between two numbers, it becomes a hyphen (1990-2000).
> - At the start or end of a line, or next to other punctuation, it's dropped.
> - Prefer something else? Pick a hyphen, an en dash, or nothing in the popup.
>
> What it leaves alone:
> - Code blocks and inline code
> - Anything you type into: text fields, Gmail, Notion and other editors
> - Code editors such as CodeMirror and Monaco
>
> It keeps up with pages that change: infinite scroll, single-page apps, live updates, iframes and web components.
>
> Turn it off everywhere or for one site from the toolbar popup.
>
> Privacy: Em Deslop runs entirely in your browser. It reads page text only to rewrite it in place, never stores or sends it anywhere, and makes no network requests. The source code is open: https://github.com/alesmartan/em-deslop

**Single purpose:**

> Replaces the em dash character (U+2014) in the text of web pages with a comma or another separator the user chooses.

**Permission justifications:**

| Permission | Justification |
|---|---|
| Host permission (content script on `<all_urls>`) | The extension's only job is to replace em dashes in the text of the pages the user reads, so its content script has to run on every site. It only changes text nodes in the page. It doesn't read form fields, cookies or network traffic, and it sends nothing anywhere. Users can turn it off per site in the popup. |
| `storage` | Saves the user's three settings: on/off, the replacement style, and the list of sites where it's turned off. |
| `activeTab` | Lets the popup read the current tab's hostname when the user clicks the toolbar icon, so it can show and toggle "On example.com". |

**Remote code:** No.

**Test instructions** (optional):

> Open any article with em dashes (for example a Wikipedia page) and they're replaced by commas. Code blocks and text fields keep them. The popup switches it off globally or per site. A self-checking test page is at https://github.com/alesmartan/em-deslop/blob/main/test/fixture.html (download it and open it with "Allow access to file URLs" on).

**Privacy policy:** host a short page, for example `PRIVACY.md` in the repo (GitHub URL) or a page on alesm.dev. It needs to say: what the extension accesses (page text, to rewrite it locally), what it stores (three settings in `chrome.storage.sync`, synced by the browser's own account sync), that nothing is collected, sold or sent to anyone, and a contact.

## 6. Repo changes before the first submission

| Change | Why |
|---|---|
| Padded store icon (96 px artwork in 128 px) and matching manifest icons | Store icon spec |
| 3 to 5 screenshots at 1280x800: before/after on a real-looking article, the popup over a page, an editor left untouched | Required, and they sell the extension. `npm run screenshots` can render them. |
| Small promo tile, 440x280 | Listings without one rank lower |
| `PRIVACY.md` | Privacy policy URL |
| New manifest `description` (the summary above) and `homepage_url` pointing at the GitHub repo | Summary and support link |
| `npm run package` script that zips `extension/` (minus `icon.svg`) to `dist/em-deslop-<version>.zip` | Repeatable uploads |
| Version bump rule: every upload needs a higher `version` | Uploads with the same version fail |

Optional later: publishing from CI with the [Chrome Web Store API v2](https://developer.chrome.com/blog/cws-api-v2), which since October 2025 supports service accounts and staged publishing. Not worth it until updates are frequent.

## 7. Other stores

| Store | Cost | Notes |
|---|---|---|
| **Microsoft Edge Add-ons** | Free. Register in Partner Center with a Microsoft or GitHub account. | Same zip works. Same privacy questions (single purpose, permissions, remote code, data, privacy policy URL). Description needs 250 to 10,000 characters. Logo 300x300 recommended, screenshots 640x480 or 1280x800, same promo tile sizes. Certification "up to seven business days". Worth doing: Edge users get a native listing instead of the "allow extensions from other stores" prompt. |
| **Opera Add-ons** | Free | Opera users can install straight from the Chrome Web Store, and Opera's own review has a reputation (forum reports, several years old) for taking months. Skip. |
| **Arc, Dia, Brave, Vivaldi, Helium** | n/a | Use the Chrome Web Store. Nothing extra to do. |
| **Firefox (AMO)** | Free | Out of scope today. It would need `browser_specific_settings` in the manifest, a check of `match_origin_as_fallback` and `chrome.dom` support, and Firefox testing. A possible later project. |

Sources: [Publish to Edge Add-ons](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension), [Edge developer account](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account), [Opera forum on review times](https://forums.opera.com/post/266333).

## 8. Order of work

1. Turn on 2-Step Verification on the Google account you'll publish with.
2. Register in the Developer Dashboard, pay the US$5 fee, verify the contact email, declare trader status.
3. Make the repo changes in section 6, bump the version to 1.0.0, build the zip.
4. Upload, fill in the tabs with the section 5 copy, set visibility to **Unlisted** for a soft launch or **Public** straight away.
5. Submit with automatic publishing off, so you choose the launch moment.
6. While waiting, submit the same zip to Edge Add-ons.
7. After approval: add store badges to the README, and link the listing from the repo description.
