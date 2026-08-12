const crypto = require('node:crypto');
const http2 = require('node:http2');

const { config } = require('./config');
const db = require('./db');

let cachedProviderToken = null;
let cachedProviderTokenAt = 0;

function isAPNsEnabled() {
  return Boolean(
    config.apns.teamId
    && config.apns.keyId
    && config.apns.privateKey
    && config.apns.bundleId
  );
}

function validateNativeToken(input) {
  const token = String(input || '').trim().toLowerCase();
  if (token.length < 32 || token.length > 512 || token.length % 2 !== 0 || !/^[0-9a-f]+$/.test(token)) {
    throw new Error('Der iOS-Push-Token ist ungültig.');
  }
  return token;
}

function normalizeEnvironment(value) {
  return value === 'sandbox' ? 'sandbox' : 'production';
}

async function ensureNativePushSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS native_push_tokens (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token text NOT NULL,
      environment text NOT NULL CHECK (environment IN ('sandbox', 'production')),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_success_at timestamptz,
      last_error text,
      UNIQUE (token, environment)
    );
    CREATE INDEX IF NOT EXISTS native_push_tokens_user_idx
      ON native_push_tokens(user_id, environment, created_at);
  `);
}

function registerNativePushRoutes(app, {
  requireAuth,
  requireVerified,
  asyncHandler,
  httpError
}) {
  app.get('/api/push/native/config', requireAuth, (_req, res) => {
    res.json({ enabled: isAPNsEnabled(), bundleId: config.apns.bundleId });
  });

  app.post('/api/push/native/tokens', requireAuth, requireVerified, asyncHandler(async (req, res) => {
    let token;
    try {
      token = validateNativeToken(req.body?.token);
    } catch (error) {
      throw httpError(400, error.message, 'INVALID_NATIVE_PUSH_TOKEN');
    }
    const environment = normalizeEnvironment(req.body?.environment);
    await ensureNativePushSchema();
    await db.query(`
      INSERT INTO native_push_tokens
        (id, user_id, token, environment, created_at, updated_at)
      VALUES ($1, $2, $3, $4, now(), now())
      ON CONFLICT (token, environment) DO UPDATE
      SET user_id = EXCLUDED.user_id,
          updated_at = now(),
          last_error = NULL
    `, [crypto.randomUUID(), req.user.id, token, environment]);
    res.status(201).json({ saved: true, enabled: isAPNsEnabled() });
  }));

  app.delete('/api/push/native/tokens', requireAuth, asyncHandler(async (req, res) => {
    let token;
    try {
      token = validateNativeToken(req.body?.token);
    } catch (error) {
      throw httpError(400, error.message, 'INVALID_NATIVE_PUSH_TOKEN');
    }
    const environment = normalizeEnvironment(req.body?.environment);
    await ensureNativePushSchema();
    await db.query(
      'DELETE FROM native_push_tokens WHERE user_id = $1 AND token = $2 AND environment = $3',
      [req.user.id, token, environment]
    );
    res.status(204).end();
  }));
}

function base64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function createProviderToken({
  teamId = config.apns.teamId,
  keyId = config.apns.keyId,
  privateKey = config.apns.privateKey,
  now = Math.floor(Date.now() / 1000)
} = {}) {
  if (!teamId || !keyId || !privateKey) throw new Error('APNs ist nicht vollständig konfiguriert.');
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = base64Url(JSON.stringify({ iss: teamId, iat: now }));
  const signingInput = `${header}.${claims}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: crypto.createPrivateKey(privateKey),
    dsaEncoding: 'ieee-p1363'
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

function providerToken() {
  const now = Math.floor(Date.now() / 1000);
  if (!cachedProviderToken || now - cachedProviderTokenAt >= 50 * 60) {
    cachedProviderToken = createProviderToken({ now });
    cachedProviderTokenAt = now;
  }
  return cachedProviderToken;
}

function buildAPNsPayload(payload) {
  return {
    aps: {
      alert: {
        title: String(payload.title || 'ZweiCheck').slice(0, 140),
        body: String(payload.body || 'Es gibt eine neue Benachrichtigung.').slice(0, 500)
      },
      sound: 'default'
    },
    url: payload.url || '/',
    checkId: payload.checkId || null,
    eventType: payload.eventType || null
  };
}

class APNSError extends Error {
  constructor(statusCode, reason, body = '') {
    super(`APNs ${statusCode}: ${reason || body || 'Unbekannter Fehler'}`);
    this.name = 'APNSError';
    this.statusCode = statusCode;
    this.reason = reason || null;
  }
}

function isPermanentAPNSError(error) {
  return error?.statusCode === 410
    || ['BadDeviceToken', 'DeviceTokenNotForTopic', 'Unregistered'].includes(error?.reason);
}

function sendAPNsRequest({ token, environment, payload }) {
  return new Promise((resolve, reject) => {
    const origin = environment === 'sandbox'
      ? 'https://api.sandbox.push.apple.com'
      : 'https://api.push.apple.com';
    const client = http2.connect(origin);
    let finished = false;
    let statusCode = 0;
    let responseBody = '';

    const finish = (callback) => {
      if (finished) return;
      finished = true;
      client.close();
      callback();
    };

    client.on('error', (error) => finish(() => reject(error)));

    const headers = {
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${providerToken()}`,
      'apns-topic': config.apns.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 300)
    };
    if (payload.tag) headers['apns-collapse-id'] = String(payload.tag).slice(0, 64);

    const request = client.request(headers);
    request.setEncoding('utf8');
    request.on('response', (responseHeaders) => {
      statusCode = Number(responseHeaders[':status'] || 0);
    });
    request.on('data', (chunk) => { responseBody += chunk; });
    request.on('error', (error) => finish(() => reject(error)));
    request.on('end', () => {
      finish(() => {
        if (statusCode === 200) return resolve({ sent: true });
        let reason;
        try { reason = JSON.parse(responseBody || '{}').reason; } catch {}
        reject(new APNSError(statusCode, reason, responseBody));
      });
    });
    request.end(JSON.stringify(buildAPNsPayload(payload)));
  });
}

async function sendNativePushForUser(userId, payload) {
  if (!isAPNsEnabled()) return { sent: 0, registered: 0, errors: [], disabled: true };
  await ensureNativePushSchema();
  const tokens = await db.query(`
    SELECT id, token, environment
    FROM native_push_tokens
    WHERE user_id = $1
    ORDER BY created_at
  `, [userId]);

  let sent = 0;
  const errors = [];
  for (const row of tokens.rows) {
    try {
      await sendAPNsRequest({ token: row.token, environment: row.environment, payload });
      sent += 1;
      await db.query(`
        UPDATE native_push_tokens
        SET last_success_at = now(), last_error = NULL, updated_at = now()
        WHERE id = $1
      `, [row.id]);
    } catch (error) {
      if (isPermanentAPNSError(error)) {
        await db.query('DELETE FROM native_push_tokens WHERE id = $1', [row.id]);
      } else {
        errors.push(error);
        await db.query(`
          UPDATE native_push_tokens
          SET last_error = $2, updated_at = now()
          WHERE id = $1
        `, [row.id, String(error?.message || error).slice(0, 1000)]);
      }
    }
  }

  return { sent, registered: tokens.rowCount, errors, disabled: false };
}

module.exports = {
  isAPNsEnabled,
  validateNativeToken,
  normalizeEnvironment,
  ensureNativePushSchema,
  registerNativePushRoutes,
  createProviderToken,
  buildAPNsPayload,
  APNSError,
  isPermanentAPNSError,
  sendNativePushForUser
};
