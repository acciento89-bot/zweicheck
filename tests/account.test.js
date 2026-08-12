const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { genericActivityBody } = require('../server/account');

const root = path.join(__dirname, '..');
const account = fs.readFileSync(path.join(root, 'server', 'account.js'), 'utf8');
const activity = fs.readFileSync(path.join(root, 'server', 'activity.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'account-client.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'account.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const pollingPatch = fs.readFileSync(path.join(root, 'scripts', 'patch-polling.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');

test('activity texts are anonymized after account deletion', () => {
  assert.equal(genericActivityBody('check_answered'), 'Eine frühere Vertrauensperson hat eine Rückmeldung gegeben.');
  assert.equal(genericActivityBody('unknown'), 'Eine frühere Vertrauensperson hat diese Aktivität ausgelöst.');
});

test('account export excludes authentication secrets by design', () => {
  assert.match(account, /Passwörter, Sitzungsschlüssel, Push-Schlüssel/);
  assert.doesNotMatch(account, /SELECT[^;]*password_hash[^;]*buildAccountExport/s);
  assert.doesNotMatch(account, /token_hash[^\n]*account:/);
  assert.match(account, /Content-Disposition/);
  assert.match(account, /Cache-Control', 'no-store/);
});

test('account deletion requires password and cleans shared data', () => {
  assert.match(account, /bcrypt\.compare/);
  assert.match(account, /DELETE FROM check_requests/);
  assert.match(account, /DELETE FROM check_reassignments/);
  assert.match(account, /DELETE FROM trust_connections/);
  assert.match(account, /UPDATE invitations/);
  assert.match(account, /UPDATE activities/);
  assert.match(account, /fs\.unlink/);
  assert.match(account, /res\.clearCookie/);
});

test('senior-first account UI uses explicit confirmation and no mutation observer', () => {
  assert.match(client, /Meine Daten herunterladen/);
  assert.match(client, /Konto dauerhaft löschen/);
  assert.match(client, /current-password/);
  assert.match(client, /confirmDelete/);
  assert.match(client, /window\.confirm/);
  assert.match(client, /unsubscribePush/);
  assert.match(client, /href="\/privacy"/);
  assert.match(client, /href="\/support"/);
  assert.match(client, /ZweiCheck 1\.0\.0/);
  assert.doesNotMatch(client, /MutationObserver/);
  assert.match(css, /min-height: 54px/);
  assert.match(css, /zc-account-links/);
  assert.match(css, /focus-visible/);
});

test('account view survives background polling without losing open state or input', () => {
  assert.match(client, /data-zc-account-privacy/);
  assert.match(pollingPatch, /#app \[data-zc-account-privacy\]/);
  assert.match(pollingPatch, /#app \[data-zc-polling-lock\]/);
  assert.match(pollingPatch, /if \(!pollingLocked\) render\(\)/);
  assert.match(pollingPatch, /patchedCodeV1/);
});

test('account assets are shipped through the existing activity registration path', () => {
  assert.match(activity, /registerAccountRoutes/);
  assert.match(activity, /account-client\.js/);
  assert.match(activity, /account\.css/);
  assert.match(index, /zweicheck-build" content="release-1\.0\.0"/);
  assert.match(index, /app\.js\?v=6/);
  assert.match(index, /app\.css\?v=2/);
  assert.match(index, /account-client\.js\?v=2/);
  assert.match(index, /account\.css\?v=2/);
  assert.match(serviceWorker, /zweicheck-phase3-v14/);
  assert.match(serviceWorker, /app\.js\?v=6/);
  assert.match(serviceWorker, /app\.css\?v=2/);
  assert.match(serviceWorker, /account-client\.js\?v=2/);
  assert.match(serviceWorker, /account\.css\?v=2/);
});

test('production start and Docker lifecycle stay unchanged', () => {
  assert.equal(packageJson.scripts.start, 'node scripts/patch-server-push.js && node server/index.js');
  assert.match(dockerfile, /node scripts\/patch-server-push\.js/);
  assert.match(dockerfile, /node scripts\/patch-polling\.js/);
  assert.doesNotMatch(packageJson.scripts.start, /account/);
  assert.doesNotMatch(dockerfile, /patch-server-account/);
});
