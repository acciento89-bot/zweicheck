const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const privacy = read('privacy.html');
const choices = read('privacy-choices.html');
const support = read('support.html');
const activity = read('server/activity.js');
const release = read('docs/APP-STORE-RELEASE.md');
const privacyDoc = read('docs/PRIVACY-AND-DELETION.md');
const index = read('index.html');
const serviceWorker = read('sw.js');
const appleAssociation = JSON.parse(read('apple-app-site-association'));

test('release is marked as version 1.0.0 without changing the production start lifecycle', () => {
  assert.equal(packageJson.version, '1.0.0');
  assert.equal(packageJson.scripts.start, 'node scripts/patch-server-push.js && node server/index.js');
  assert.match(index, /zweicheck-release" content="1\.0\.0"/);
  assert.match(index, /zweicheck-build" content="release-1\.0\.0"/);
});

test('public privacy, privacy choices and support pages contain real release information', () => {
  assert.match(privacy, /Datenschutz bei ZweiCheck/);
  assert.match(privacy, /contact@kamilunavo\.com/);
  assert.match(privacy, /Konto → Konto löschen/);
  assert.match(privacy, /Keine Werbung und kein Tracking/);
  assert.match(choices, /Meine Daten herunterladen/);
  assert.match(choices, /Konto dauerhaft löschen/);
  assert.match(support, /Hilfe und Support/);
  assert.match(support, /contact@kamilunavo\.com/);
  assert.doesNotMatch(support, /Passwort\s*:/i);
});

test('release pages and Apple association are served explicitly instead of falling through to the SPA', () => {
  assert.match(activity, /app\.get\(\['\/privacy', '\/privacy\.html'\]/);
  assert.match(activity, /app\.get\(\['\/privacy-choices', '\/privacy-choices\.html'\]/);
  assert.match(activity, /app\.get\(\['\/support', '\/support\.html'\]/);
  assert.match(activity, /\.well-known\/apple-app-site-association/);
  assert.match(serviceWorker, /'\/privacy'/);
  assert.match(serviceWorker, /'\/privacy-choices'/);
  assert.match(serviceWorker, /'\/support'/);
});

test('apple association is restricted to ZweiCheck invitation and check fragments', () => {
  const details = appleAssociation.applinks.details[0];
  assert.deepEqual(details.appIDs, ['TKG684N5GL.de.kamilunavo.zweicheck']);
  assert.equal(details.components[0]['#'], 'invite=*');
  assert.equal(details.components[1]['#'], 'check=*');
});

test('app store release documentation covers review, privacy and native minimum functionality', () => {
  assert.match(release, /Xcode 26/);
  assert.match(release, /de\.kamilunavo\.zweicheck/);
  assert.match(release, /TKG684N5GL/);
  assert.match(release, /Privacy Policy/);
  assert.match(release, /Review-Konto A/);
  assert.match(release, /Share Sheet \/ Share Extension/);
  assert.match(release, /native Push Notifications über APNs/);
  assert.match(release, /Passwörter niemals im Repository speichern/);
});

test('technical privacy documentation reflects implemented self-service deletion', () => {
  assert.match(privacyDoc, /Self-Service-Kontolöschung/);
  assert.match(privacyDoc, /produkt\w* implementiert/i);
  assert.match(privacyDoc, /Upload-Dateien werden physisch/);
  assert.doesNotMatch(privacyDoc, /erfolgt eine Löschung administrativ/);
});
