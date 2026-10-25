import { describe, expect, it } from 'vitest';
import { EmDash } from './setup.js';

const { replaceDashes } = EmDash;
const D = '\u2014';

describe('replaceDashes, comma style', () => {
  const r = (text, context) => replaceDashes(text, 'comma', context);

  it.each([
    [`word${D}word`, 'word, word'],
    [`word ${D} word`, 'word, word'],
    [`word ${D}word`, 'word, word'],
    [`word${D} word`, 'word, word'],
    [`word ${D} word`, 'word, word'],
    [`word ${D} word`, 'word, word'],
    [`word${D}${D}word`, 'word, word'],
    [`a${D}b${D}c`, 'a, b, c'],
  ])('between words: %j', (input, expected) => expect(r(input)).toBe(expected));

  it('turns digit ranges into a hyphen', () => {
    expect(r(`1990${D}2000`)).toBe('1990-2000');
    expect(r(`pages 10 ${D} 12`)).toBe('pages 10-12');
  });

  it('drops a leading dash and keeps the indent', () => {
    expect(r(`${D} Author Name`)).toBe('Author Name');
    expect(r(`\n  ${D} Author`)).toBe('\n  Author');
  });

  it('drops a trailing dash', () => {
    expect(r(`trailing${D}`)).toBe('trailing');
    expect(r(`trailing ${D} `)).toBe('trailing ');
  });

  it.each([
    [`a${D}, b`, 'a, b'],
    [`end${D}.`, 'end.'],
    [`wait${D}?`, 'wait?'],
    [`(see below${D})`, '(see below)'],
    [`"Hello${D}"`, '"Hello"'],
    [`“Hello${D}”`, '“Hello”'],
  ])('drops the dash before punctuation: %j', (input, expected) => expect(r(input)).toBe(expected));

  it('drops the dash after an opening bracket', () => {
    expect(r(`(${D}aside)`)).toBe('(aside)');
  });

  it('uses a plain space after sentence punctuation', () => {
    expect(r(`end.${D} Next`)).toBe('end. Next');
  });

  it('treats a closing ASCII quote like a word', () => {
    expect(r(`"Hello"${D}she said`)).toBe('"Hello", she said');
  });

  it('handles non-Latin text', () => {
    expect(r(`слово${D}слово`)).toBe('слово, слово');
    expect(r(`中文${D}中文`)).toBe('中文, 中文');
  });

  it('uses context at the edges of a text node', () => {
    // <b>word</b>\u2014word
    expect(r(`${D}word`, { before: 'd' })).toBe(', word');
    // word \u2014<i>word</i>
    expect(r(`word ${D}`, { after: 'w' })).toBe('word, ');
    // <b>a</b>\u2014<b>b</b>
    expect(r(D, { before: 'a', after: 'b' })).toBe(', ');
    // Empty context means a real boundary.
    expect(r(`${D} Author`, { before: '' })).toBe('Author');
  });
});

describe('replaceDashes, other styles', () => {
  const input = `late${D}too late, 1990${D}2000, ${D} start`;

  it('hyphen', () => {
    expect(replaceDashes(`late${D}too late`, 'hyphen')).toBe('late - too late');
    expect(replaceDashes(`1990${D}2000`, 'hyphen')).toBe('1990-2000');
  });

  it('en dash', () => {
    expect(replaceDashes(`late${D}too late`, 'endash')).toBe('late – too late');
    expect(replaceDashes(`1990${D}2000`, 'endash')).toBe('1990–2000');
  });

  it('remove leaves one space between words', () => {
    expect(replaceDashes(`late${D}too late`, 'remove')).toBe('late too late');
    expect(replaceDashes(`late ${D} too late`, 'remove')).toBe('late too late');
    expect(replaceDashes(`1990${D}2000`, 'remove')).toBe('1990-2000');
  });

  it('falls back to comma for an unknown style', () => {
    expect(replaceDashes(`a${D}b`, 'nope')).toBe('a, b');
  });

  it.each(EmDash.STYLES)('%s never leaves an em dash behind', (style) => {
    expect(replaceDashes(input, style)).not.toContain(D);
  });
});

describe('replaceDashes, no-ops', () => {
  it('returns the identical string when there is no em dash', () => {
    const s = 'nothing to do here';
    expect(replaceDashes(s)).toBe(s);
  });

  it('leaves en dashes, hyphens and lookalikes alone', () => {
    const s = 'a–b a-b a―b a⸺b';
    expect(replaceDashes(s)).toBe(s);
  });
});
