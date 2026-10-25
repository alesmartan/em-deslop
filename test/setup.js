// Loads the classic content-script files in manifest order. Each one attaches
// itself to globalThis.EmDash, the same way it does in the browser.
import '../extension/lib/replace.js';
import '../extension/lib/walk.js';
import '../extension/lib/observe.js';
import '../extension/lib/settings.js';

export const EmDash = globalThis.EmDash;
