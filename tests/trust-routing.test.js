const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizePresenceStatus,
  normalizeDurationMinutes,
  normalizeUserId,
  effectivePresence
} = require('../server/trust-routing');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const serverPatch = fs.readFileSync(path.join(root, 'scripts', 'patch-server-push.js'), 'utf8');
const appPatch = fs.readFileSync(path.join(root, 'scripts', 'patch-polling.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'server', 'trust-routing-schema.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const client = fs.readFileSync(path.join(root, 'trust-routing.js'), 'utf8');

test('presence status and duration are restricted to supported values', () => {
  assert.equal(normalizePresenceStatus('available'), 'available');
  assert.equal(normalizePresenceStatus('urgent_only'), 'urgent_only');
  assert.equal(normalizePresenceStatus('invalid'), 'neutral');
  assert.equal(normalizeDurationMinutes(60), 60);
  assert.equal(normalizeDurationMinutes('240'), 240);
  assert.equal(normalizeDurationMinutes(999), null);
  assert.equal(normalizeDurationMinutes(0), null);
});

test('expired presence becomes neutral automatically', () => {
  const now = new Date('2026-08-12T08:00:00Z');
  const expired = effectivePresence({
    status: 'available',
    expires_at: '2026-08-12T07:59:00Z',
    updated_at: '2026-08-12T07:00:00Z'
  }, now);
  assert.equal(expired.status, 'neutral');

  const active = effectivePresence({
    status: 'urgent_only',
    expires_at: '2026-08-12T09:00:00Z',
    updated_at: '2026-08-12T07:00:00Z'
  }, now);
  assert.equal(active.status, 'urgent_only');
});

test('reroute target ids must be UUIDs', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  assert.equal(normalizeUserId(id), id);
  assert.equal(normalizeUserId('not-an-id'), null);
});

test('trust routing assets are shipped and cached', () => {
  assert.match(index, /trust-routing\.css\?v=1/);
  assert.match(index, /trust-routing\.js\?v=2/);
  assert.match(index, /meta name="zweicheck-build" content="[^"]+"/);
  assert.match(serviceWorker, /const CACHE_NAME = 'zweicheck-phase3-v\d+'/);
  assert.match(serviceWorker, /trust-routing\.js\?v=2/);
  assert.match(client, /fallbackReviewerId/);
  assert.match(client, /data-zc-reroute/);
});

test('build patch scopes trust routing observer to direct app renders only', () => {
  assert.match(appPatch, /const trustFile = 'trust-routing\.js'/);
  assert.match(appPatch, /observer\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/);
  assert.match(appPatch, /document\.getElementById\('app'\)/);
  assert.match(appPatch, /observer\.observe\(appRoot, \{ childList: true \}\)/);
  assert.doesNotMatch(appPatch, /observer\.observe\(appRoot, \{ childList: true, subtree: true \}\)/);
});

test('routing uses the existing stable startup patch and one-time fallback fields', () => {
  assert.match(serverPatch, /registerTrustRoutingRoutes/);
  assert.match(serverPatch, /ensureTrustRoutingSchema/);
  assert.match(serverPatch, /fallbackReviewerId/);
  assert.match(serverPatch, /check_rerouted/);
  assert.match(appPatch, /data-check-detail/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS user_presence/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS check_reassignments/);
  assert.match(schema, /ADD COLUMN IF NOT EXISTS fallback_reviewer_id/);
});

test('production command and Docker entry remain on the proven Phase 3.2 lifecycle', () => {
  assert.equal(packageJson.scripts.start, 'node scripts/patch-server-push.js && node server/index.js');
  assert.match(dockerfile, /RUN node scripts\/patch-polling\.js \\\n && node scripts\/patch-server-push\.js/);
  assert.doesNotMatch(dockerfile, /prepare-runtime/);
});
