// @ts-check
// Watch for text that shows up after the first pass: SPA navigation, infinite
// scroll, frameworks updating a text node in place. Batches everything into
// one flush per animation frame.
(() => {
  'use strict';

  const EmDash = (globalThis.EmDash ??= {});

  const OPTIONS = { childList: true, subtree: true, characterData: true };

  // rAF runs right before paint, so new text is fixed before anyone sees it.
  // It also pauses in background tabs, which is fine: work waits until visible.
  /** @param {() => void} cb */
  const nextFrame = (cb) =>
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : setTimeout(cb, 16);

  /**
   * @param {(nodes: Node[]) => void} onFlush receives connected nodes only
   */
  function createDashObserver(onFlush) {
    /** @type {Set<Node>} */
    const pending = new Set();
    /** @type {WeakSet<Node>} */
    const observedRoots = new WeakSet();
    /** @type {MutationObserver[]} */
    const observers = [];
    let scheduled = false;
    // Records collected before start() are kept, so nothing parsed while
    // settings load is missed.
    let running = false;
    let stopped = false;

    /** @param {MutationRecord[]} records */
    function onRecords(records) {
      for (const record of records) {
        if (record.type === 'characterData') pending.add(record.target);
        else for (const node of record.addedNodes) pending.add(node);
      }
      schedule();
    }

    function schedule() {
      if (!running || scheduled || pending.size === 0) return;
      scheduled = true;
      nextFrame(flush);
    }

    function flush() {
      scheduled = false;
      if (!running) return;
      const nodes = [];
      for (const node of pending) if (node.isConnected) nodes.push(node);
      pending.clear();
      if (nodes.length) onFlush(nodes);
    }

    return {
      /** @param {Node} root a Document or ShadowRoot */
      observe(root) {
        if (stopped || observedRoots.has(root)) return;
        observedRoots.add(root);
        const observer = new MutationObserver(onRecords);
        observer.observe(root, OPTIONS);
        observers.push(observer);
      },
      start() {
        if (stopped) return;
        running = true;
        schedule();
      },
      /** Run pending work now instead of waiting for the next frame. */
      flushNow() {
        for (const observer of observers) {
          const records = observer.takeRecords();
          if (records.length) onRecords(records);
        }
        flush();
      },
      disconnect() {
        stopped = true;
        running = false;
        for (const observer of observers) observer.disconnect();
        observers.length = 0;
        pending.clear();
      },
    };
  }

  EmDash.createDashObserver = createDashObserver;
})();
