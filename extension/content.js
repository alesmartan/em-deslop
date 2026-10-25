// @ts-check
// Content script entry. Runs at document_start in every frame, after
// lib/replace.js, lib/walk.js, lib/observe.js and lib/settings.js.
(() => {
  'use strict';

  const EmDash = globalThis.EmDash;
  if (EmDash.started) return;
  EmDash.started = true;

  const { settings: Settings, processSubtree, createDashObserver, getShadowRoot } = EmDash;

  // A custom element is re-checked for a late shadow root this many times,
  // then dropped. Most attach one within a second or two of the definition
  // loading. Elements that render into light DOM never will.
  const SWEEP_ATTEMPTS = 5;
  const SWEEP_DELAY_MS = 1000;

  /** This frame's host, plus the top-level page's, so disabling a site also covers its iframes. */
  function frameHosts() {
    const hosts = [location.hostname];
    const ancestors = location.ancestorOrigins;
    if (ancestors?.length) {
      try {
        hosts.push(new URL(ancestors[ancestors.length - 1]).hostname);
      } catch {}
    }
    // about:blank and srcdoc frames have no host of their own.
    if (!location.hostname) {
      try {
        hosts.push(parent.location.hostname);
      } catch {}
    }
    return hosts.filter(Boolean);
  }

  const hosts = frameHosts();

  /** @type {ReturnType<typeof createDashObserver> | null} */
  let observer = null;
  // False until settings say this frame should be touched.
  let active = false;
  /** @type {Map<Element, number>} */
  const candidates = new Map();
  let sweepTimer = 0;

  const options = {
    style: Settings.DEFAULTS.style,
    /** @param {ShadowRoot} root */
    onShadowRoot: (root) => observer?.observe(root),
    /** @param {Element} host */
    onShadowCandidate: (host) => {
      if (!candidates.has(host)) candidates.set(host, 0);
    },
  };

  /** @param {Node} root */
  const run = (root) => processSubtree(root, options);

  function sweep() {
    for (const [host, attempts] of candidates) {
      const shadow = host.isConnected ? getShadowRoot(host) : null;
      if (shadow) {
        candidates.delete(host);
        observer?.observe(shadow);
        run(shadow);
      } else if (!host.isConnected || attempts + 1 >= SWEEP_ATTEMPTS) {
        candidates.delete(host);
      } else {
        candidates.set(host, attempts + 1);
      }
    }
  }

  function scheduleSweep() {
    if (sweepTimer || candidates.size === 0) return;
    sweepTimer = setTimeout(() => {
      sweepTimer = 0;
      if (observer) sweep();
    }, SWEEP_DELAY_MS);
  }

  function fullPass() {
    if (!active || !observer) return;
    run(document);
    scheduleSweep();
  }

  function watch() {
    observer = createDashObserver((nodes) => {
      for (const node of nodes) run(node);
      scheduleSweep();
    });
    observer.observe(document);
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    candidates.clear();
  }

  // The parser keeps inserting while settings load, so start watching first
  // and decide what to do with the queued records once settings arrive.
  watch();

  // The parser can append to a text node it already inserted, which the
  // observer may not report. A full pass at these points is cheap.
  document.addEventListener('DOMContentLoaded', fullPass, { once: true });
  window.addEventListener('load', fullPass, { once: true });

  Settings.load().then((settings) => {
    options.style = settings.style;
    active = Settings.isActive(settings, hosts);
    if (!active) {
      stop();
      return;
    }
    fullPass();
    observer?.start();
  });

  // Turning on applies live. Turning off stops touching new text; text already
  // rewritten stays until reload (the popup reloads the tab it was opened on).
  Settings.onChange((settings) => {
    options.style = settings.style;
    active = Settings.isActive(settings, hosts);
    if (active && !observer) {
      watch();
      fullPass();
      observer?.start();
    } else if (!active && observer) {
      stop();
    }
  });
})();
