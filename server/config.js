const path = require('node:path');

function booleanValue(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function integerValue(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const config = {
  port: integerValue(process.env.PORT, 3000),
  appBaseUrl: (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://zweicheck:zweicheck@localhost:5432/zweicheck',
  databaseSsl: booleanValue(process.env.DATABASE_SSL, false),
  trustProxy: integerValue(process.env.TRUST_PROXY, 1),
  cookieName: 'zc_session',
  cookieSecure: booleanValue(process.env.SESSION_COOKIE_SECURE, true),
  sessionTtlDays: integerValue(process.env.SESSION_TTL_DAYS, 30),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'data', 'uploads')),
  maxUploadBytes: integerValue(process.env.MAX_UPLOAD_BYTES, 8 * 1024 * 1024),
  emailMode: (process.env.EMAIL_MODE || 'log').toLowerCase(),
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: integerValue(process.env.SMTP_PORT, 587),
    secure: booleanValue(process.env.SMTP_SECURE, false),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'ZweiCheck <noreply@localhost>'
  }
};

module.exports = { config, booleanValue, integerValue };
