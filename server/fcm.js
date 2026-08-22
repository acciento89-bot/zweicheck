const crypto = require('node:crypto');

const { config } = require('./config');
const db = require('./db');

let tokenCache = { value: '', expiresAt: 0 };

function isFCMEnabled() {
  return Boolean(config.fcm.projectId && config.fcm.clientEmail && config.fcm.privateKey);
}

function validateFCMToken(input) {
  const token = String(input || '').trim();
  if (token.length < 20 || token.length > 4096 || /\s/.test(token)) {
    throw new Error('Der Android-Push-Token ist ungültig.');
  }
  return token;
}

async function ensureFCMPushSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS fcm_push_tokens (
      id uuid PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      last_success_at timestamptz,
      last_error text
    );
    CREATE INDEX IF NOT EXISTS fcm_push_tokens_user_idx
      ON fcm_push_tokens(user_id, created_at);
  `);
}

function registerFCMPushRoutes(app, {
  requireAuth,
  requireVerified,
  asyncHandler,
  httpError
}) {
  app.get('/api/push/fcm/config', requireAuth, (_req, res) => {
    res.json({ enabled: isFCMEnabled() });
  });

  app.post('/api/push/fcm/tokens', requireAuth, requireVerified, asyncHandler(async (req, res) => {
    let token;
    try {
      token = validateFCMToken(req.body?.token);
    } catch (error) {
      throw httpError(400, error.message, 'INVALID_FCM_TOKEN');
    }
    await ensureFCMPushSchema();
    await db.query(`
      INSERT INTO fcm_push_tokens (id,user_id,token,created_at,updated_at)
      VALUES ($1,$2,$3,now(),now())
      ON CONFLICT (token) DO UPDATE
      SET user_id=EXCLUDED.user_id, updated_at=now(), last_error=NULL
    `, [crypto.randomUUID(), req.user.id, token]);
    res.status(201).json({ saved:true, enabled:isFCMEnabled() });
  }));

  app.delete('/api/push/fcm/tokens', requireAuth, asyncHandler(async (req, res) => {
    let token;
    try {
      token = validateFCMToken(req.body?.token);
    } catch (error) {
      throw httpError(400, error.message, 'INVALID_FCM_TOKEN');
    }
    await ensureFCMPushSchema();
    await db.query('DELETE FROM fcm_push_tokens WHERE user_id=$1 AND token=$2', [req.user.id, token]);
    res.status(204).end();
  }));
}

function jwtPart(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function accessToken() {
  if (!isFCMEnabled()) throw new Error('FCM ist nicht vollständig konfiguriert.');
  if (tokenCache.value && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;

  const now = Math.floor(Date.now() / 1000);
  const header = jwtPart({alg:'RS256',typ:'JWT'});
  const claims = jwtPart({
    iss: config.fcm.clientEmail,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: config.fcm.tokenUri,
    iat: now,
    exp: now + 3600
  });
  const input = `${header}.${claims}`;
  const signature = crypto.sign('RSA-SHA256', Buffer.from(input), config.fcm.privateKey).toString('base64url');
  const response = await fetch(config.fcm.tokenUri, {
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({
      grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:`${input}.${signature}`
    })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`Firebase OAuth fehlgeschlagen (${response.status}).`);
  tokenCache = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in || 3600)) * 1000
  };
  return tokenCache.value;
}

class FCMError extends Error {
  constructor(statusCode, reason, body = '') {
    super(`FCM ${statusCode}: ${reason || body || 'Unbekannter Fehler'}`);
    this.name = 'FCMError';
    this.statusCode = statusCode;
    this.reason = reason || null;
  }
}

function isPermanentFCMError(error) {
  return error?.statusCode === 404 || error?.reason === 'UNREGISTERED';
}

function buildFCMMessage(token, payload) {
  return {
    message: {
      token,
      data: {
        title: String(payload.title || 'ZweiCheck').slice(0, 140),
        body: String(payload.body || 'Es gibt eine neue Benachrichtigung.').slice(0, 500),
        url: String(payload.url || '/'),
        checkId: String(payload.checkId || ''),
        eventType: String(payload.eventType || '')
      },
      android: {
        priority: 'high',
        ttl: '300s',
        collapse_key: String(payload.tag || payload.checkId || 'zweicheck').slice(0, 64)
      }
    }
  };
}

async function sendFCMRequest({ token, payload }) {
  const bearer = await accessToken();
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.fcm.projectId)}/messages:send`,
    {
      method:'POST',
      headers:{authorization:`Bearer ${bearer}`,'content-type':'application/json'},
      body:JSON.stringify(buildFCMMessage(token, payload))
    }
  );
  const body = await response.json().catch(() => ({}));
  if (response.ok) return {sent:true,name:body.name || null};
  const details = Array.isArray(body?.error?.details) ? body.error.details : [];
  const fcmDetail = details.find(item => item?.['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError');
  const reason = fcmDetail?.errorCode || body?.error?.status || null;
  throw new FCMError(response.status, reason, body?.error?.message || '');
}

async function sendFCMPushForUser(userId, payload) {
  if (!isFCMEnabled()) return {sent:0,registered:0,errors:[],disabled:true};
  await ensureFCMPushSchema();
  const tokens = await db.query(`
    SELECT id,token FROM fcm_push_tokens WHERE user_id=$1 ORDER BY created_at
  `, [userId]);

  let sent = 0;
  const errors = [];
  for (const row of tokens.rows) {
    try {
      await sendFCMRequest({token:row.token,payload});
      sent += 1;
      await db.query(`
        UPDATE fcm_push_tokens
        SET last_success_at=now(),last_error=NULL,updated_at=now()
        WHERE id=$1
      `, [row.id]);
    } catch (error) {
      if (isPermanentFCMError(error)) {
        await db.query('DELETE FROM fcm_push_tokens WHERE id=$1', [row.id]);
      } else {
        errors.push(error);
        await db.query(`
          UPDATE fcm_push_tokens SET last_error=$2,updated_at=now() WHERE id=$1
        `, [row.id,String(error?.message || error).slice(0,1000)]);
      }
    }
  }
  return {sent,registered:tokens.rowCount,errors,disabled:false};
}

module.exports = {
  isFCMEnabled,
  validateFCMToken,
  ensureFCMPushSchema,
  registerFCMPushRoutes,
  buildFCMMessage,
  FCMError,
  isPermanentFCMError,
  sendFCMPushForUser
};
