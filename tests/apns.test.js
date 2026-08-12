const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateNativeToken,
  normalizeEnvironment,
  createProviderToken,
  buildAPNsPayload,
  isPermanentAPNSError,
  APNSError
} = require('../server/apns');

test('native APNs token validation accepts opaque hexadecimal tokens without fixing one exact length', () => {
  assert.equal(validateNativeToken('A1'.repeat(32)), 'a1'.repeat(32));
  assert.equal(validateNativeToken('b2'.repeat(48)), 'b2'.repeat(48));
  assert.throws(() => validateNativeToken('not-a-device-token'), /ungültig/);
});

test('APNs environment defaults safely to production', () => {
  assert.equal(normalizeEnvironment('sandbox'), 'sandbox');
  assert.equal(normalizeEnvironment('production'), 'production');
  assert.equal(normalizeEnvironment('anything'), 'production');
});

test('provider token is a valid ES256 JWT with team and key id', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const token = createProviderToken({
    teamId: 'TEAM123456',
    keyId: 'KEY1234567',
    privateKey: privatePem,
    now: 1_700_000_000
  });
  const [headerPart, claimsPart, signaturePart] = token.split('.');
  const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8'));
  const signature = Buffer.from(signaturePart, 'base64url');

  assert.deepEqual(header, { alg: 'ES256', kid: 'KEY1234567' });
  assert.deepEqual(claims, { iss: 'TEAM123456', iat: 1_700_000_000 });
  assert.equal(signature.length, 64);
  assert.equal(crypto.verify('sha256', Buffer.from(`${headerPart}.${claimsPart}`), {
    key: publicKey,
    dsaEncoding: 'ieee-p1363'
  }, signature), true);
});

test('native payload stays privacy-safe and only carries notification summary plus navigation ids', () => {
  const payload = buildAPNsPayload({
    title: 'Neue Prüfanfrage',
    body: 'Piotr braucht deinen zweiten Blick.',
    url: 'https://zweicheck.kamilunavo.com/#check=123',
    checkId: '123',
    eventType: 'check_created',
    description: 'Sensible TAN 123456'
  });

  assert.equal(payload.aps.alert.title, 'Neue Prüfanfrage');
  assert.equal(payload.checkId, '123');
  assert.doesNotMatch(JSON.stringify(payload), /Sensible TAN/);
});

test('permanently invalid APNs device tokens are recognized', () => {
  assert.equal(isPermanentAPNSError(new APNSError(410, 'Unregistered')), true);
  assert.equal(isPermanentAPNSError(new APNSError(400, 'BadDeviceToken')), true);
  assert.equal(isPermanentAPNSError(new APNSError(503, 'ServiceUnavailable')), false);
});
