// @ts-check
// DOM side: find text nodes with em dashes, skip code and anything editable,
// rewrite Text.data in place. Depends on lib/replace.js.
(() => {
  'use strict';

  const EmDash = (globalThis.EmDash ??= {});
  const { DASH } = EmDash;

  // Lowercase localName, so SVG <style> and <script> match too.
  const SKIP_TAGS = new Set([
    'script', 'style', 'noscript', 'template',
    'textarea', 'input', 'select', 'option',
    'code', 'pre', 'kbd', 'samp', 'var',
  ]);
  // Code editors built from plain divs, ARIA textboxes, and the opt-out marker.
  const SKIP_SELECTOR = [
    '.CodeMirror', '.cm-editor', '.monaco-editor', '.ace_editor',
    '[role="textbox"]', '[data-emdash-keep]',
  ].join(',');

  // Inline elements: text continues across them, so a dash at the edge of a
  // text node can still sit between two words. Anything else is a boundary.
  const INLINE = new Set([
    'a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'del', 'dfn', 'em',
    'font', 'i', 'ins', 'kbd', 'label', 'mark', 'q', 's', 'samp', 'small',
    'span', 'strong', 'sub', 'sup', 'time', 'u', 'var',
  ]);

  /** @param {Element} el */
  function isEditable(el) {
    if (/** @type {HTMLElement} */ (el).isContentEditable) return true;
    // jsdom doesn't implement isContentEditable, so check the attribute too.
    const attr = el.getAttribute('contenteditable');
    return attr !== null && attr.toLowerCase() !== 'false';
  }

  /** @param {Element} el */
  function shouldSkipElement(el) {
    return SKIP_TAGS.has(el.localName) || isEditable(el) || el.matches(SKIP_SELECTOR);
  }

  /**
   * True when any ancestor (crossing shadow root boundaries) is skipped.
   * Used for single nodes reported by the observer.
   * @param {Node} node
   */
  function isInSkippedSubtree(node) {
    if (node.ownerDocument?.designMode === 'on') return true;
    /** @type {Node | null} */
    let cur = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    while (cur) {
      if (cur.nodeType === Node.ELEMENT_NODE && shouldSkipElement(/** @type {Element} */ (cur))) return true;
      cur = cur.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? /** @type {ShadowRoot} */ (cur).host ?? null : cur.parentNode;
    }
    return false;
  }

  /**
   * Nearest non-space character next to `node` in the same run of inline text,
   * or '' at a block boundary.
   * @param {Node} node
   * @param {boolean} forward
   */
  function adjacentChar(node, forward) {
    /** @type {Node} */
    let cur = node;
    for (let depth = 0; depth < 8; depth++) {
      let sib = forward ? cur.nextSibling : cur.previousSibling;
      while (sib) {
        if (sib.nodeType === Node.ELEMENT_NODE && !INLINE.has(/** @type {Element} */ (sib).localName)) return '';
        if (sib.nodeType === Node.TEXT_NODE || sib.nodeType === Node.ELEMENT_NODE) {
          const text = sib.textContent ?? '';
          const trimmed = forward ? text.trimStart() : text.trimEnd();
          if (trimmed) return forward ? trimmed[0] : trimmed[trimmed.length - 1];
        }
        sib = forward ? sib.nextSibling : sib.previousSibling;
      }
      const parent = cur.parentNode;
      if (!parent || parent.nodeType !== Node.ELEMENT_NODE || !INLINE.has(/** @type {Element} */ (parent).localName)) return '';
      cur = parent;
    }
    return '';
  }

  const LEADING_DASH = /^\s*\u2014/;
  const TRAILING_DASH = /\u2014\s*$/;

  /**
   * Rewrite one text node. Assumes the caller already checked its ancestors.
   * Only writes when the value changes, which is what stops the observer from
   * looping on its own writes.
   * @param {Text} node
   * @param {string} style
   * @returns {boolean} whether the node changed
   */
  function rewriteTextNode(node, style) {
    const data = node.data;
    if (!data.includes(DASH)) return false;
    /** @type {{ before?: string, after?: string }} */
    const context = {};
    if (LEADING_DASH.test(data)) context.before = adjacentChar(node, false);
    if (TRAILING_DASH.test(data)) context.after = adjacentChar(node, true);
    const next = EmDash.replaceDashes(data, style, context);
    if (next === data) return false;
    node.data = next;
    return true;
  }

  /**
   * @param {Element} el
   * @returns {ShadowRoot | null}
   */
  function getShadowRoot(el) {
    if (el.shadowRoot) return el.shadowRoot;
    // Closed roots: only extensions can reach them, via chrome.dom (Chrome 88+).
    // Only custom elements (a "-" in the name) are worth the call.
    const dom = globalThis.chrome?.dom;
    if (dom?.openOrClosedShadowRoot && el.localName.includes('-')) {
      try {
        return dom.openOrClosedShadowRoot(/** @type {HTMLElement} */ (el)) ?? null;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * @typedef {object} WalkOptions
   * @property {string} style
   * @property {(root: ShadowRoot, host: Element) => void} [onShadowRoot]
   *   Called for each shadow root found, before it's walked.
   * @property {(host: Element) => void} [onShadowCandidate]
   *   Called for custom elements with no shadow root yet. They often attach one
   *   later, when their definition loads, without any DOM mutation to notice.
   */

  /**
   * Rewrite every eligible text node under `root`, including open and closed
   * shadow roots. Safe to call repeatedly.
   * @param {Node} root
   * @param {WalkOptions} options
   * @returns {number} text nodes changed
   */
  function processSubtree(root, options) {
    if (root.nodeType === Node.TEXT_NODE) {
      if (isInSkippedSubtree(root)) return 0;
      return rewriteTextNode(/** @type {Text} */ (root), options.style) ? 1 : 0;
    }
    if (root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      if (isInSkippedSubtree(root)) return 0;
    } else if (root.nodeType === Node.DOCUMENT_NODE) {
      if (/** @type {Document} */ (root).designMode === 'on') return 0;
    } else {
      return 0;
    }

    /** @type {Element[]} */
    const hosts = [];
    if (root.nodeType === Node.ELEMENT_NODE) hosts.push(/** @type {Element} */ (root));

    const doc = root.ownerDocument ?? /** @type {Document} */ (root);
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = /** @type {Element} */ (node);
          // REJECT skips the element and its whole subtree in one step.
          if (shouldSkipElement(el)) return NodeFilter.FILTER_REJECT;
          if (el.shadowRoot || el.localName.includes('-')) hosts.push(el);
          return NodeFilter.FILTER_SKIP;
        }
        return /** @type {Text} */ (node).data.includes(DASH) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });

    // Collect first, then write, so the walk never sees its own changes.
    /** @type {Text[]} */
    const hits = [];
    while (walker.nextNode()) hits.push(/** @type {Text} */ (walker.currentNode));

    let changed = 0;
    for (const node of hits) if (rewriteTextNode(node, options.style)) changed++;

    for (const host of hosts) {
      const shadow = getShadowRoot(host);
      if (shadow) {
        options.onShadowRoot?.(shadow, host);
        changed += processSubtree(shadow, options);
      } else if (host.localName.includes('-')) {
        options.onShadowCandidate?.(host);
      }
    }
    return changed;
  }

  EmDash.shouldSkipElement = shouldSkipElement;
  EmDash.isInSkippedSubtree = isInSkippedSubtree;
  EmDash.getShadowRoot = getShadowRoot;
  EmDash.processSubtree = processSubtree;
})();
