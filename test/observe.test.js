import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EmDash } from './setup.js';

const { createDashObserver, processSubtree } = EmDash;
const D = '\u2014';

const frame = () => new Promise((resolve) => setTimeout(resolve, 40));

let observer;
let flushes;

function setup({ start = true } = {}) {
  flushes = 0;
  const options = { style: 'comma', onShadowRoot: (root) => observer.observe(root) };
  observer = createDashObserver((nodes) => {
    flushes++;
    for (const node of nodes) processSubtree(node, options);
  });
  observer.observe(document);
  if (start) observer.start();
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => observer?.disconnect());

describe('createDashObserver', () => {
  it('rewrites an appended paragraph after a frame', async () => {
    setup();
    const p = document.createElement('p');
    p.textContent = `new${D}text`;
    document.body.append(p);
    await frame();
    expect(p.textContent).toBe('new, text');
  });

  it('catches text changed in place (characterData)', async () => {
    document.body.innerHTML = '<p id="p">plain</p>';
    setup();
    document.getElementById('p').firstChild.data = `now${D}dashed`;
    await frame();
    expect(document.getElementById('p').textContent).toBe('now, dashed');
  });

  it('leaves nodes added inside skipped elements alone', async () => {
    document.body.innerHTML = '<pre id="pre"></pre><div contenteditable="true" id="ed"></div>';
    setup();
    document.getElementById('pre').append(`a${D}b`);
    const p = document.createElement('p');
    p.textContent = `c${D}d`;
    document.getElementById('ed').append(p);
    await frame();
    expect(document.getElementById('pre').textContent).toBe(`a${D}b`);
    expect(p.textContent).toBe(`c${D}d`);
  });

  it('walks and observes shadow roots on newly added elements', async () => {
    setup();
    const host = document.createElement('x-card');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<p id="a">a${D}b</p>`;
    document.body.append(host);
    await frame();
    expect(root.getElementById('a').textContent).toBe('a, b');

    // Later additions inside that shadow root are seen too.
    const p = document.createElement('p');
    p.textContent = `c${D}d`;
    root.append(p);
    await frame();
    expect(p.textContent).toBe('c, d');
  });

  it('does not loop on its own writes', async () => {
    setup();
    const p = document.createElement('p');
    p.textContent = `a${D}b`;
    document.body.append(p);
    await frame();
    await frame();
    await frame();
    // One flush for the insert, at most one for the write it caused.
    expect(flushes).toBeLessThanOrEqual(2);
    expect(p.textContent).toBe('a, b');
  });

  it('ignores nodes removed before the flush', async () => {
    setup();
    const p = document.createElement('p');
    p.textContent = `a${D}b`;
    document.body.append(p);
    p.remove();
    await frame();
    expect(flushes).toBe(0);
    expect(p.textContent).toBe(`a${D}b`);
  });

  it('queues records until start()', async () => {
    setup({ start: false });
    const p = document.createElement('p');
    p.textContent = `a${D}b`;
    document.body.append(p);
    await frame();
    expect(p.textContent).toBe(`a${D}b`);
    observer.start();
    await frame();
    expect(p.textContent).toBe('a, b');
  });

  it('flushNow processes without waiting for a frame', () => {
    setup();
    const p = document.createElement('p');
    p.textContent = `a${D}b`;
    document.body.append(p);
    observer.flushNow();
    expect(p.textContent).toBe('a, b');
  });

  it('stops after disconnect()', async () => {
    setup();
    observer.disconnect();
    const p = document.createElement('p');
    p.textContent = `a${D}b`;
    document.body.append(p);
    await frame();
    expect(p.textContent).toBe(`a${D}b`);
  });
});
