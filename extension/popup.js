// @ts-check
// Popup: global switch, per-site switch, replacement style.
(() => {
  'use strict';

  const { settings: Settings, replaceDashes } = globalThis.EmDash;

  const SAMPLE = 'late\u2014too late';
  // Pages Chrome never lets extensions script, even with <all_urls>.
  const BLOCKED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com', 'microsoftedge.microsoft.com', 'addons.opera.com'];

  const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
  const enabledInput = /** @type {HTMLInputElement} */ ($('enabled'));
  const siteInput = /** @type {HTMLInputElement} */ ($('site'));
  const siteRow = $('site-row');
  const siteLabel = $('site-label');
  const status = $('status');
  const note = $('note');
  const styleInputs = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll('input[name="style"]'));

  for (const el of document.querySelectorAll('.preview')) {
    el.textContent = replaceDashes(SAMPLE, /** @type {HTMLElement} */ (el).dataset.style);
  }

  /** @type {chrome.tabs.Tab | undefined} */
  let tab;
  /** Where the content script can run: http(s) and file pages. */
  let scriptable = false;
  /** Hostname for the per-site switch. Empty for file:// pages. */
  let host = '';
  /** @type {import('./lib/settings.js').Settings} */
  let current = Settings.DEFAULTS;

  async function readTab() {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // activeTab grants the URL of the tab the popup was opened on.
    if (!tab?.url) return;
    try {
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        host = url.hostname;
        scriptable = !BLOCKED_HOSTS.includes(host);
      } else if (url.protocol === 'file:') {
        scriptable = true;
      }
    } catch {}
  }

  function render() {
    const siteDisabled = Settings.hostListed(current.disabledHosts, host);
    enabledInput.checked = current.enabled;
    siteInput.checked = !siteDisabled;
    for (const input of styleInputs) input.checked = input.value === current.style;

    siteLabel.textContent = host ? `On ${host}` : 'This site';
    const siteUsable = Boolean(host) && scriptable && current.enabled;
    siteInput.disabled = !siteUsable;
    siteRow.classList.toggle('disabled', !siteUsable);

    if (!scriptable) {
      status.textContent = "Browsers don't let extensions change this page.";
    } else if (!current.enabled) {
      status.textContent = 'Off everywhere.';
    } else if (siteDisabled) {
      status.textContent = `Off on ${host}. On everywhere else.`;
    } else {
      status.textContent = host ? `Replacing em dashes on ${host}.` : 'Replacing em dashes in this file.';
    }
    note.hidden = !scriptable;
  }

  /** @param {Partial<import('./lib/settings.js').Settings>} patch */
  async function update(patch) {
    current = { ...current, ...patch };
    render();
    await Settings.save(patch);
    // Rewritten text can't be put back in place, so reload to apply cleanly.
    if (scriptable && tab?.id !== undefined) chrome.tabs.reload(tab.id);
  }

  enabledInput.addEventListener('change', () => update({ enabled: enabledInput.checked }));

  siteInput.addEventListener('change', () => {
    if (!host) return;
    // Remove the exact host and any parent entry that covers it.
    const others = current.disabledHosts.filter((h) => !Settings.hostListed([h], host));
    update({ disabledHosts: siteInput.checked ? others : [...others, host] });
  });

  for (const input of styleInputs) {
    input.addEventListener('change', () => {
      if (input.checked) update({ style: input.value });
    });
  }

  Promise.all([readTab(), Settings.load()]).then(([, settings]) => {
    current = settings;
    render();
    // Force a style pass with the initial state, then allow transitions.
    void document.body.offsetHeight;
    document.body.classList.add('ready');
  });

  // Another window's popup, or sync from another machine.
  Settings.onChange((settings) => {
    current = settings;
    render();
  });
})();
