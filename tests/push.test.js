const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateSubscription,
  buildPushPayload,
  isExpiredPushError
} = require('../server/push');

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  requester_id: '22222222-2222-4222-8222-222222222222',
  reviewer_id: '33333333-3333-4333-8333-333333333333',
  requester_name: 'Piotr',
  reviewer_name: 'Diana',
  category: 'payment',
  recommendation: 'do_not_act',
  description: 'Diese sensible Beschreibung darf nicht im Push stehen.'
};

test('push subscription validation accepts secure browser subscriptions', () => {
  const subscription = validateSubscription({
    endpoint: 'https://push.example.test/subscription/123',
    keys: { p256dh: 'public-key', auth: 'auth-key' }
  });

  assert.equal(subscription.endpoint, 'https://push.example.test/subscription/123');
  assert.equal(subscription.keys.auth, 'auth-key');
});

test('push subscription validation rejects insecure endpoints', () => {
  assert.throws(() => validateSubscription({
    endpoint: 'http://push.example.test/subscription/123',
    keys: { p256dh: 'public-key', auth: 'auth-key' }
  }), /ungültig/);
});

test('new check push goes to reviewer without sensitive description', () => {
  const result = buildPushPayload('check_created', row);

  assert.equal(result.userId, row.reviewer_id);
  assert.match(result.payload.title, /Neue Prüfanfrage/);
  assert.match(result.payload.body, /Piotr/);
  assert.match(result.payload.url, /#check=11111111/);
  assert.doesNotMatch(JSON.stringify(result.payload), /sensible Beschreibung/);
});

test('answered check push goes to requester', () => {
  const result = buildPushPayload('check_answered', row);

  assert.equal(result.userId, row.requester_id);
  assert.match(result.payload.body, /Diana/);
  assert.match(result.payload.body, /Nicht handeln/);
});

test('expired push endpoints are recognized', () => {
  assert.equal(isExpiredPushError({ statusCode: 404 }), true);
  assert.equal(isExpiredPushError({ statusCode: 410 }), true);
  assert.equal(isExpiredPushError({ statusCode: 503 }), false);
});

test('service worker and page ship push support', () => {
  const root = path.join(__dirname, '..');
  const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'push-client.js'), 'utf8');

  assert.match(serviceWorker, /addEventListener\('push'/);
  assert.match(serviceWorker, /notificationclick/);
  assert.match(page, /push-client\.js\?v=1/);
  assert.match(client, /Notification\.requestPermission/);
  assert.match(client, /pushManager\.subscribe/);
});
