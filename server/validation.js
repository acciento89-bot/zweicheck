const CATEGORIES = new Set(['message', 'payment', 'link', 'data']);
const URGENCIES = new Set(['none', 'low', 'high', 'very_high']);
const RECOMMENDATIONS = new Set(['do_not_act', 'verify_personally', 'plausible', 'call_me']);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validateEmail(value) {
  const email = normalizeEmail(value);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.');
  }
  return email;
}

function validateName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) {
    throw new Error('Der Name muss zwischen 2 und 80 Zeichen lang sein.');
  }
  return name;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('Das Passwort muss mindestens 10 Zeichen lang sein und darf höchstens 72 Bytes umfassen.');
  }
  if (!/[A-Za-zÄÖÜäöüß]/.test(password) || !/\d/.test(password)) {
    throw new Error('Das Passwort muss Buchstaben und mindestens eine Zahl enthalten.');
  }
  return password;
}

function validateCategory(value) {
  if (!CATEGORIES.has(value)) throw new Error('Ungültige Prüfungsart.');
  return value;
}

function validateUrgency(value) {
  if (!URGENCIES.has(value)) throw new Error('Ungültige Dringlichkeit.');
  return value;
}

function validateRecommendation(value) {
  if (!RECOMMENDATIONS.has(value)) throw new Error('Ungültige Handlungsempfehlung.');
  return value;
}

function validateText(value, { name = 'Text', min = 1, max = 1000 } = {}) {
  const text = String(value || '').trim();
  if (text.length < min || text.length > max) {
    throw new Error(`${name} muss zwischen ${min} und ${max} Zeichen lang sein.`);
  }
  return text;
}

function optionalText(value, max = 1000) {
  const text = String(value || '').trim();
  if (text.length > max) throw new Error(`Der Text darf höchstens ${max} Zeichen lang sein.`);
  return text || null;
}

function parseAmountToCents(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const normalized = String(value).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Bitte gib einen gültigen Betrag ein.');
  }
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Ungültiger Betrag.');
  return cents;
}

module.exports = {
  CATEGORIES,
  URGENCIES,
  RECOMMENDATIONS,
  normalizeEmail,
  validateEmail,
  validateName,
  validatePassword,
  validateCategory,
  validateUrgency,
  validateRecommendation,
  validateText,
  optionalText,
  parseAmountToCents
};
