// @ts-check
// Pure text rules: turn em dashes into something else. No DOM access.
// Classic script: content scripts can't use `import`, so everything hangs off
// globalThis.EmDash. Tests import this file for the same side effect.
(() => {
  'use strict';

  const EmDash = (globalThis.EmDash ??= {});

  const DASH = '\u2014';
  const STYLES = ['comma', 'hyphen', 'endash', 'remove'];

  // A run of em dashes plus the whitespace around it. `\s` covers NBSP and
  // the thin/hair spaces some sites put around dashes.
  const DASH_RUN = /(\s*)\u2014+(\s*)/g;
  const DIGIT = /\p{Nd}/u;
  // Punctuation that already separates: the dash adds nothing before it.
  const CLOSING = new Set([',', '.', ';', ':', '!', '?', ')', ']', '}', '"', "'", '”', '’', '»', '…']);
  // Characters after which the dash adds nothing either: brackets and
  // unambiguous opening quotes. ASCII quotes are left out because they close
  // as often as they open.
  const OPENING = new Set(['(', '[', '{', '“', '‘', '«', '¿', '¡']);
  const SENTENCE_END = new Set([',', '.', ';', ':', '!', '?', '…']);

  const SEPARATOR = { comma: ', ', hyphen: ' - ', endash: ' – ', remove: ' ' };

  /**
   * @typedef {{ before?: string, after?: string }} DashContext
   * The nearest non-space character outside this string, for strings that are
   * one piece of a larger run of text (a DOM text node split by inline tags).
   * An empty string or a missing key means a real boundary: start or end of
   * the block, a line break, or a block element.
   */

  /**
   * @param {string} text
   * @param {string} [style]
   * @param {DashContext} [context]
   * @returns {string} the same string when there's nothing to change
   */
  function replaceDashes(text, style = 'comma', context = {}) {
    if (!text.includes(DASH)) return text;
    const separator = SEPARATOR[/** @type {keyof typeof SEPARATOR} */ (style)] ?? SEPARATOR.comma;

    return text.replace(DASH_RUN, (match, lead, trail, offset) => {
      const end = offset + match.length;
      const before = offset > 0 ? text[offset - 1] : context.before ?? '';
      const after = end < text.length ? text[end] : context.after ?? '';

      // "\u2014 Author" at the start of a block: drop the dash, keep the indent.
      if (before === '') return lead;
      // "trailing\u2014" at the end of a block.
      if (after === '') return trail;
      // "wait\u2014?" and "(see below\u2014)": the punctuation is enough.
      if (CLOSING.has(after)) return '';
      // "(\u2014aside)".
      if (OPENING.has(before)) return '';
      // "1990\u20142000" is a range.
      if (DIGIT.test(before) && DIGIT.test(after)) return style === 'endash' ? '–' : '-';
      // "end.\u2014 Next": a separator is already there.
      if (SENTENCE_END.has(before)) return ' ';
      return separator;
    });
  }

  EmDash.DASH = DASH;
  EmDash.STYLES = STYLES;
  EmDash.replaceDashes = replaceDashes;
})();
