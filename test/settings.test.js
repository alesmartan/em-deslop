import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmDash } from './setup.js';

const { settings: Settings } = EmDash;

let store;
beforeEach(() => {
  store = {};
  globalThis.chrome = {
    storage: {
      sync: {
        get: vi.fn(async (defaults) => ({ ...defaults, ...store })),
        set: vi.fn(async (patch) => Object.assign(store, patch)),
      },
      onChanged: { addListener: vi.fn() },
    },
  };
});

describe('settings', () => {
  it('loads defaults when storage is empty', async () => {
    expect(await Settings.load()).toEqual({ enabled: true, style: 'comma', disabledHosts: [] });
  });

  it('round-trips saved values', async () => {
    await Settings.save({ style: 'endash', disabledHosts: ['example.com'] });
    expect(await Settings.load()).toEqual({ enabled: true, style: 'endash', disabledHosts: ['example.com'] });
  });

  it('repairs bad stored values', async () => {
    store = { enabled: 'yes', style: 'bogus', disabledHosts: 'example.com' };
    expect(await Settings.load()).toEqual({ enabled: true, style: 'comma', disabledHosts: [] });
  });

  it('falls back to defaults when storage throws', async () => {
    chrome.storage.sync.get = vi.fn(async () => {
      throw new Error('Extension context invalidated.');
    });
    expect((await Settings.load()).enabled).toBe(true);
  });

  it('matches a listed host and its subdomains only', () => {
    const list = ['example.com'];
    expect(Settings.hostListed(list, 'example.com')).toBe(true);
    expect(Settings.hostListed(list, 'www.example.com')).toBe(true);
    expect(Settings.hostListed(list, 'notexample.com')).toBe(false);
    expect(Settings.hostListed(list, '')).toBe(false);
  });

  it('isActive checks the global switch and every host given', () => {
    const s = { enabled: true, style: 'comma', disabledHosts: ['news.site'] };
    expect(Settings.isActive(s, ['other.site'])).toBe(true);
    expect(Settings.isActive(s, ['news.site'])).toBe(false);
    // An iframe on a disabled top-level site.
    expect(Settings.isActive(s, ['widget.cdn', 'news.site'])).toBe(false);
    expect(Settings.isActive({ ...s, enabled: false }, ['other.site'])).toBe(false);
  });
});
