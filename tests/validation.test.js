const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateEmail,
  validatePassword,
  parseAmountToCents,
  validateCategory,
  validateRecommendation
} = require('../server/validation');
const { randomCode, hashToken, samePair } = require('../server/security');

test('E-Mail-Adressen werden normalisiert', () => {
  assert.equal(validateEmail('  Test@Example.COM '), 'test@example.com');
  assert.throws(() => validateEmail('keine-mail'));
});

test('Passwörter brauchen Länge, Buchstaben und Zahl', () => {
  assert.equal(validatePassword('SicheresPasswort7'), 'SicheresPasswort7');
  assert.throws(() => validatePassword('nurtexttext'));
  assert.throws(() => validatePassword('Kurz1'));
});

test('Beträge werden korrekt in Cent umgerechnet', () => {
  assert.equal(parseAmountToCents('12,50'), 1250);
  assert.equal(parseAmountToCents('100'), 10000);
  assert.equal(parseAmountToCents(''), null);
  assert.throws(() => parseAmountToCents('12,999'));
});

test('Nur definierte Kategorien und Empfehlungen sind erlaubt', () => {
  assert.equal(validateCategory('payment'), 'payment');
  assert.equal(validateRecommendation('do_not_act'), 'do_not_act');
  assert.throws(() => validateCategory('sonstiges'));
  assert.throws(() => validateRecommendation('safe'));
});

test('Einladungscodes sind gut lesbar und Hashes stabil', () => {
  const code = randomCode(8);
  assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(hashToken(code), hashToken(code));
  assert.notEqual(hashToken(code), hashToken(`${code}X`));
});

test('Verbindungspaare werden stabil sortiert', () => {
  assert.deepEqual(samePair('b', 'a'), ['a', 'b']);
  assert.deepEqual(samePair('a', 'b'), ['a', 'b']);
});
