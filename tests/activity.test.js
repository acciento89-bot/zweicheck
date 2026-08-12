const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampLimit,
  parseBefore,
  normalizeFilter,
  serializeActivity
} = require('../server/activity');

const root = path.join(__dirname, '..');
const schema = fs.readFileSync(path.join(root, 'server', 'schema.sql'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const client = fs.readFileSync(path.join(root, 'activity-center.js'), 'utf8');
const patch = fs.readFileSync(path.join(root, 'scripts', 'patch-server-push.js'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('activity query values are safely normalized', () => {
  assert.equal(clampLimit('12'), 12);
  assert.equal(clampLimit('999'), 50);
  assert.equal(clampLimit('-2'), 1);
  assert.equal(parseBefore('42'), 42);
  assert.equal(parseBefore('nope'), null);
  assert.equal(normalizeFilter('unread'), 'unread');
  assert.equal(normalizeFilter('anything'), 'all');
});

test('activity rows are serialized without internal dedupe data', () => {
  const activity = serializeActivity({
    id: 7,
    event_type: 'check_answered',
    title: 'Antwort erhalten',
    body: 'Eine Rückmeldung liegt vor.',
    actor_name: 'Diana',
    check_id: '11111111-1111-4111-8111-111111111111',
    invitation_id: null,
    connection_id: null,
    read_at: null,
    created_at: '2026-08-09T20:00:00.000Z',
    dedupe_key: 'internal-only'
  });

  assert.equal(activity.id, '7');
  assert.equal(activity.actorName, 'Diana');
  assert.equal(activity.icon, '↩');
  assert.equal(Object.hasOwn(activity, 'dedupeKey'), false);
});

test('database triggers create generic privacy-safe activity messages', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS activities/);
  assert.match(schema, /zc_activity_check_created_trigger/);
  assert.match(schema, /zc_activity_invitation_changed_trigger/);
  assert.match(schema, /zc_activity_connection_revoked_trigger/);
  assert.doesNotMatch(schema, /NEW\.description/);
  assert.doesNotMatch(schema, /NEW\.response_note/);
});

test('activity drawer is isolated from the main application render tree', () => {
  assert.match(client, /document\.body\.append\(button, overlay\)/);
  assert.match(client, /zc-activity-overlay/);
  assert.match(client, /api\/activities\/unread-count/);
  assert.match(client, /activities\/read-all/);
  assert.doesNotMatch(client, /\.app-main.*innerHTML/);
  assert.doesNotMatch(client, /data-activity-nav/);
});

test('activity center is shipped through the existing proven push integration', () => {
  assert.match(index, /activity-center\.css\?v=2/);
  assert.match(index, /activity-center\.js\?v=2/);
  assert.match(index, /activity-center-clean-v2/);
  assert.match(serviceWorker, /activity-center\.js\?v=2/);
  assert.match(serviceWorker, /zweicheck-phase3-v7/);
  assert.match(patch, /registerActivityRoutes/);
  assert.match(patch, /activity-center\.js/);
});

test('production start and Docker lifecycle remain unchanged from Phase 3.2', () => {
  assert.equal(packageJson.scripts.start, 'node scripts/patch-server-push.js && node server/index.js');
  assert.match(dockerfile, /node scripts\/patch-server-push\.js/);
  assert.doesNotMatch(dockerfile, /patch-server-activity/);
  assert.doesNotMatch(packageJson.scripts.start, /prepare-runtime/);
});
