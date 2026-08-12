const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));

test('page keeps browser zoom available and offers a keyboard skip link', () => {
  assert.match(index, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
  assert.doesNotMatch(index, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(index, /maximum-scale/i);
  assert.match(index, /class="skip-link" href="#app">Direkt zum Inhalt/);
  assert.match(index, /id="app" tabindex="-1"/);
});

test('main application root is not a noisy live region during background polling', () => {
  assert.doesNotMatch(index, /id="app"[^>]*aria-live/);
  assert.match(index, /id="toast-root"[^>]*aria-live="assertive"[^>]*aria-atomic="true"/);
});

test('senior-first CSS provides large touch targets and clear keyboard focus', () => {
  assert.match(css, /body \{\n  font-size: 17px;/);
  assert.match(css, /input, select, textarea \{\n  min-height: 54px;/);
  assert.match(css, /\.button-small,[\s\S]*min-height: 48px;/);
  assert.match(css, /:where\(button, a, input, select, textarea, summary, \[tabindex\]\):focus-visible/);
  assert.match(css, /outline: 4px solid var\(--navy-800\)/);
  assert.match(css, /\.skip-link:focus \{ transform: translateY\(0\); \}/);
});

test('motion and contrast preferences are respected', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation-duration: \.01ms !important/);
  assert.match(css, /@media \(prefers-contrast: more\)/);
  assert.match(css, /@media \(forced-colors: active\)/);
});

test('PWA metadata remains installable and stable', () => {
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.lang, 'de');
  assert.equal(manifest.prefer_related_applications, false);
  assert.match(index, /apple-mobile-web-app-capable/);
  assert.match(index, /zweicheck-accessibility" content="senior-a11y-v1"/);
  assert.match(index, /app\.css\?v=2/);
  assert.match(index, /zweicheck-release" content="1\.0\.0"/);
  assert.match(serviceWorker, /zweicheck-phase3-v15/);
  assert.match(serviceWorker, /app\.css\?v=2/);
});
