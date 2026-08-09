const crypto = require('node:crypto');

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function randomCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let index = 0; index < length; index += 1) {
    result += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }
  return result;
}

function parseCookies(header = '') {
  const cookies = {};
  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function samePair(firstId, secondId) {
  return firstId.localeCompare(secondId) < 0
    ? [firstId, secondId]
    : [secondId, firstId];
}

module.exports = { hashToken, randomToken, randomCode, parseCookies, samePair };
