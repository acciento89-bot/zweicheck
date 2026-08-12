const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'deep-link.js'), 'utf8');
const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

test('deep link waits for the authenticated app and opens a check', () => {
  assert.match(source, /URLSearchParams/);
  assert.match(source, /\.app-shell/);
  assert.match(source, /dataset\.checkId/);
  assert.match(source, /MutationObserver/);
});

test('deep link script is shipped and cached', () => {
  assert.match(index, /deep-link\.js\?v=1/);
  assert.match(serviceWorker, /deep-link\.js\?v=1/);
  assert.match(serviceWorker, /zweicheck-phase3-v8/);
});
