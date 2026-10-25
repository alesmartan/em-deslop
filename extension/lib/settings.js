// @ts-check
// Settings in chrome.storage.sync, shared by the content script and the popup.
// Depends on lib/replace.js for the list of styles.
(() => {
  'use strict';

  const EmDash = (globalThis.EmDash ??= {});

  const { STYLES } = EmDash;

  /** @typedef {{ enabled: boolean, style: string, disabledHosts: string[] }} Settings */

  /** @type {Settings} */
  const DEFAULTS = { enabled: true, style: 'comma', disabledHosts: [] };

  /**
   * @param {Partial<Settings> | undefined} raw
   * @returns {Settings}
   */
  function normalize(raw) {
    const value = { ...DEFAULTS, ...raw };
    return {
      enabled: value.enabled !== false,
      style: STYLES.includes(value.style) ? value.style : DEFAULTS.style,
      disabledHosts: Array.isArray(value.disabledHosts)
        ? value.disabledHosts.filter((h) => typeof h === 'string' && h)
        : [],
    };
  }

  /** @returns {Promise<Settings>} */
  async function load() {
    try {
      return normalize(await chrome.storage.sync.get(DEFAULTS));
    } catch {
      // Storage can fail in odd contexts (an orphaned script after the
      // extension reloads). Fall back to defaults rather than doing nothing.
      return normalize(undefined);
    }
  }

  /** @param {Partial<Settings>} patch */
  async function save(patch) {
    await chrome.storage.sync.set(patch);
  }

  /**
   * "example.com" in the list also covers "www.example.com".
   * @param {string[]} list
   * @param {string} host
   */
  function hostListed(list, host) {
    if (!host) return false;
    return list.some((h) => host === h || host.endsWith('.' + h));
  }

  /**
   * @param {Settings} settings
   * @param {string[]} hosts this frame's host plus the top-level page's host
   */
  function isActive(settings, hosts) {
    return settings.enabled && !hosts.some((h) => hostListed(settings.disabledHosts, h));
  }

  /** @param {(settings: Settings) => void} callback */
  function onChange(callback) {
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === 'sync') load().then(callback);
    });
  }

  EmDash.settings = { DEFAULTS, normalize, load, save, hostListed, isActive, onChange };
})();
