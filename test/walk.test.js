import { beforeEach, describe, expect, it } from 'vitest';
import { EmDash } from './setup.js';

const { processSubtree } = EmDash;
const D = '\u2014';
const opts = { style: 'comma' };

/** @param {string} html */
function mount(html) {
  document.body.innerHTML = html;
  return document.body;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.title = '';
});

describe('processSubtree', () => {
  it('rewrites paragraph text in place, keeping the same Text node', () => {
    mount(`<p id="p">one${D}two</p>`);
    const text = document.getElementById('p').firstChild;
    expect(processSubtree(document.body, opts)).toBe(1);
    expect(document.getElementById('p').firstChild).toBe(text);
    expect(text.data).toBe('one, two');
  });

  it.each(['pre', 'code', 'kbd', 'samp', 'var', 'textarea', 'script', 'style', 'noscript'])(
    'skips <%s> and its children',
    (tag) => {
      mount(`<${tag} id="x">a${D}b</${tag}>`);
      processSubtree(document.body, opts);
      expect(document.getElementById('x').textContent).toBe(`a${D}b`);
    },
  );

  it('skips nested children of a skipped element', () => {
    mount(`<pre><span id="s">a${D}b</span></pre>`);
    processSubtree(document.body, opts);
    expect(document.getElementById('s').textContent).toBe(`a${D}b`);
  });

  it('skips contenteditable roots and their children', () => {
    mount(`<div contenteditable="true"><p id="e">a${D}b</p></div><div contenteditable><p id="f">a${D}b</p></div>`);
    processSubtree(document.body, opts);
    expect(document.getElementById('e').textContent).toBe(`a${D}b`);
    expect(document.getElementById('f').textContent).toBe(`a${D}b`);
  });

  it('does not skip contenteditable="false"', () => {
    mount(`<div contenteditable="false" id="x">a${D}b</div>`);
    processSubtree(document.body, opts);
    expect(document.getElementById('x').textContent).toBe('a, b');
  });

  it('leaves input values alone', () => {
    mount(`<input id="i" value="a${D}b"><textarea id="t">a${D}b</textarea>`);
    processSubtree(document.body, opts);
    expect(document.getElementById('i').value).toBe(`a${D}b`);
    expect(document.getElementById('t').value).toBe(`a${D}b`);
  });

  it.each(['CodeMirror', 'cm-editor', 'monaco-editor', 'ace_editor'])('skips .%s editors', (cls) => {
    mount(`<div class="${cls}"><div id="x">a${D}b</div></div>`);
    processSubtree(document.body, opts);
    expect(document.getElementById('x').textContent).toBe(`a${D}b`);
  });

  it('skips [data-emdash-keep] and role=textbox', () => {
    mount(`<div data-emdash-keep><p id="k">a${D}b</p></div><div role="textbox" id="t">a${D}b</div>`);
    processSubtree(document.body, opts);
    expect(document.getElementById('k').textContent).toBe(`a${D}b`);
    expect(document.getElementById('t').textContent).toBe(`a${D}b`);
  });

  it('rewrites text inside open shadow roots, nested too', () => {
    mount('<x-outer id="host"></x-outer>');
    const outer = document.getElementById('host').attachShadow({ mode: 'open' });
    outer.innerHTML = `<p id="a">a${D}b</p><x-inner id="inner"></x-inner>`;
    const inner = outer.getElementById('inner').attachShadow({ mode: 'open' });
    inner.innerHTML = `<p id="b">c${D}d</p>`;

    const roots = [];
    processSubtree(document.body, { ...opts, onShadowRoot: (root) => roots.push(root) });
    expect(outer.getElementById('a').textContent).toBe('a, b');
    expect(inner.getElementById('b').textContent).toBe('c, d');
    expect(roots).toEqual([outer, inner]);
  });

  it('skips shadow content under a skipped ancestor', () => {
    mount('<pre><x-thing id="host"></x-thing></pre>');
    const root = document.getElementById('host').attachShadow({ mode: 'open' });
    root.innerHTML = `<span id="s">a${D}b</span>`;
    processSubtree(root, opts);
    expect(root.getElementById('s').textContent).toBe(`a${D}b`);
  });

  it('reports custom elements without a shadow root as candidates', () => {
    mount('<x-late id="late"></x-late><div></div>');
    const candidates = [];
    processSubtree(document.body, { ...opts, onShadowCandidate: (el) => candidates.push(el) });
    expect(candidates).toEqual([document.getElementById('late')]);
  });

  it('rewrites document.title when walking the document', () => {
    document.title = `Title ${D} Site`;
    processSubtree(document, opts);
    expect(document.title).toBe('Title, Site');
  });

  it('uses neighbouring inline text for dashes at node edges', () => {
    mount(`<p id="p"><b>word</b>${D}word and <i>this</i> ${D} <em>that</em></p>`);
    processSubtree(document.body, opts);
    expect(document.getElementById('p').textContent).toBe('word, word and this, that');
  });

  it('treats block elements and line breaks as boundaries', () => {
    mount(`<blockquote>Quote</blockquote><p id="p">${D} Author</p><p id="q">line<br>${D} next</p>`);
    processSubtree(document.body, opts);
    expect(document.getElementById('p').textContent).toBe('Author');
    expect(document.getElementById('q').textContent).toBe('linenext');
  });

  it('changes nothing on a second pass', () => {
    mount(`<p>a${D}b</p><p>${D} c</p>`);
    expect(processSubtree(document.body, opts)).toBe(2);
    expect(processSubtree(document.body, opts)).toBe(0);
  });

  it('processes a single text node, respecting its ancestors', () => {
    mount(`<p id="p">a${D}b</p><pre id="pre">c${D}d</pre>`);
    processSubtree(document.getElementById('p').firstChild, opts);
    processSubtree(document.getElementById('pre').firstChild, opts);
    expect(document.getElementById('p').textContent).toBe('a, b');
    expect(document.getElementById('pre').textContent).toBe(`c${D}d`);
  });

  it('applies the chosen style', () => {
    mount(`<p id="p">a${D}b</p>`);
    processSubtree(document.body, { style: 'endash' });
    expect(document.getElementById('p').textContent).toBe('a – b');
  });
});
