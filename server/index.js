const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const { config } = require('./config');
const db = require('./db');
const { deliverEmail } = require('./mailer');
const {
  hashToken,
  randomToken,
  randomCode,
  parseCookies,
  samePair
} = require('./security');
const {
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
} = require('./validation');

const IMAGE_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

function httpError(status, message, code = 'REQUEST_FAILED') {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function serializeUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    emailVerified: Boolean(row.email_verified_at),
    createdAt: row.created_at
  };
}

function sessionCookieOptions(expiresAt) {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt
  };
}

async function createSession(res, userId) {
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at)
     VALUES ($1, $2, $3)`,
    [tokenHash, userId, expiresAt]
  );
  res.cookie(config.cookieName, token, sessionCookieOptions(expiresAt));
}

async function removeSession(req, res) {
  if (req.sessionTokenHash) {
    await db.query('DELETE FROM sessions WHERE token_hash = $1', [req.sessionTokenHash]);
  }
  res.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/'
  });
}

async function loadSession(req, _res, next) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[config.cookieName];
    if (!token) return next();

    const tokenHash = hashToken(token);
    const result = await db.query(
      `SELECT u.*, s.token_hash
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [tokenHash]
    );

    if (result.rowCount === 1) {
      req.user = result.rows[0];
      req.sessionTokenHash = tokenHash;
      db.query('UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1', [tokenHash]).catch(() => {});
    }
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireAuth(req, _res, next) {
  if (!req.user) return next(httpError(401, 'Bitte melde dich an.', 'AUTH_REQUIRED'));
  return next();
}

function requireVerified(req, _res, next) {
  if (!req.user?.email_verified_at) {
    return next(httpError(403, 'Bitte bestätige zuerst deine E-Mail-Adresse.', 'EMAIL_NOT_VERIFIED'));
  }
  return next();
}

function sameOrigin(req, _res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  const expected = `${req.protocol}://${req.get('host')}`;
  if (origin !== expected) return next(httpError(403, 'Ungültige Anfragequelle.', 'ORIGIN_REJECTED'));
  return next();
}

async function issueEmailToken(user, purpose) {
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + (purpose === 'verify' ? 24 : 1) * 60 * 60 * 1000);
  const id = crypto.randomUUID();

  await db.withTransaction(async (client) => {
    await client.query(
      `UPDATE email_tokens SET used_at = now()
       WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
      [user.id, purpose]
    );
    await client.query(
      `INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, user.id, purpose, tokenHash, expiresAt]
    );
  });

  const route = purpose === 'verify' ? 'verify' : 'reset';
  const url = `${config.appBaseUrl}/#${route}=${encodeURIComponent(token)}`;
  const subject = purpose === 'verify' ? 'E-Mail für ZweiCheck bestätigen' : 'ZweiCheck-Passwort zurücksetzen';
  const text = purpose === 'verify'
    ? `Hallo ${user.name},\n\nbestätige deine E-Mail-Adresse über diesen Link:\n${url}\n\nDer Link ist 24 Stunden gültig.`
    : `Hallo ${user.name},\n\nsetze dein Passwort über diesen Link zurück:\n${url}\n\nDer Link ist eine Stunde gültig. Falls du das nicht angefordert hast, ignoriere diese Nachricht.`;
  const delivery = await deliverEmail({ to: user.email, subject, text });
  return { url, delivery };
}

async function activeConnection(firstId, secondId, client = db) {
  const result = await client.query(
    `SELECT id FROM trust_connections
     WHERE revoked_at IS NULL
       AND ((user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1))
     LIMIT 1`,
    [firstId, secondId]
  );
  return result.rows[0] || null;
}

async function fetchCheckForUser(checkId, userId) {
  const result = await db.query(
    `SELECT c.*,
            requester.name AS requester_name,
            reviewer.name AS reviewer_name,
            EXISTS (
              SELECT 1 FROM trust_connections tc
              WHERE tc.revoked_at IS NULL
                AND ((tc.user_a_id = c.requester_id AND tc.user_b_id = c.reviewer_id)
                  OR (tc.user_a_id = c.reviewer_id AND tc.user_b_id = c.requester_id))
            ) AS connection_active
     FROM check_requests c
     JOIN users requester ON requester.id = c.requester_id
     JOIN users reviewer ON reviewer.id = c.reviewer_id
     WHERE c.id = $1`,
    [checkId]
  );
  if (!result.rowCount) return null;
  const check = result.rows[0];
  if (check.requester_id === userId) return check;
  if (check.reviewer_id === userId && check.connection_active) return check;
  return null;
}

function serializeCheck(row, attachments = []) {
  return {
    id: row.id,
    requesterId: row.requester_id,
    requesterName: row.requester_name,
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name,
    category: row.category,
    description: row.description,
    amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
    urgency: row.urgency,
    status: row.status,
    recommendation: row.recommendation,
    responseNote: row.response_note,
    respondedAt: row.responded_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      originalName: attachment.original_name,
      mimeType: attachment.mime_type,
      sizeBytes: attachment.size_bytes,
      url: `/api/attachments/${attachment.id}`
    }))
  };
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => callback(null, config.uploadDir),
  filename: (_req, file, callback) => {
    const extension = IMAGE_TYPES.get(file.mimetype) || '';
    callback(null, `${crypto.randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 3, fields: 10, fieldNameSize: 100, fieldSize: 20 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (!IMAGE_TYPES.has(file.mimetype)) {
      return callback(httpError(400, 'Nur JPG-, PNG- und WebP-Bilder sind erlaubt.', 'INVALID_FILE_TYPE'));
    }
    return callback(null, true);
  }
});

async function removeUploadedFiles(files = []) {
  await Promise.all(files.map((file) => fs.unlink(file.path).catch(() => {})));
}

async function validateUploadedImages(files = []) {
  for (const file of files) {
    const handle = await fs.open(file.path, 'r');
    try {
      const buffer = Buffer.alloc(12);
      await handle.read(buffer, 0, buffer.length, 0);
      const jpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
      const png = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const webp = buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
      const valid = (file.mimetype === 'image/jpeg' && jpeg)
        || (file.mimetype === 'image/png' && png)
        || (file.mimetype === 'image/webp' && webp);
      if (!valid) throw httpError(400, 'Eine hochgeladene Datei ist kein gültiges Bild.', 'INVALID_IMAGE');
    } finally {
      await handle.close();
    }
  }
}

function buildApp() {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"]
      }
    },
    crossOriginResourcePolicy: { policy: 'same-origin' }
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(loadSession);
  app.use('/api', sameOrigin);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Versuche. Bitte warte kurz.' }
  });
  app.use('/api/auth', authLimiter);

  app.get('/health', asyncHandler(async (_req, res) => {
    await db.query('SELECT 1');
    res.type('text/plain').send('ok');
  }));
  app.get('/api/health', asyncHandler(async (_req, res) => {
    await db.query('SELECT 1');
    res.json({ ok: true });
  }));

  app.post('/api/auth/register', asyncHandler(async (req, res) => {
    const name = validateName(req.body.name);
    const email = validateEmail(req.body.email);
    const password = validatePassword(req.body.password);
    const passwordHash = await bcrypt.hash(password, 12);
    const id = crypto.randomUUID();

    try {
      const result = await db.query(
        `INSERT INTO users (id, email, name, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [id, email, name, passwordHash]
      );
      const user = result.rows[0];
      await createSession(res, user.id);
      const verification = await issueEmailToken(user, 'verify');
      res.status(201).json({
        user: serializeUser(user),
        emailDelivery: verification.delivery.mode,
        debugUrl: verification.delivery.mode === 'log' ? verification.url : undefined
      });
    } catch (error) {
      if (error.code === '23505') throw httpError(409, 'Für diese E-Mail-Adresse existiert bereits ein Konto.', 'EMAIL_EXISTS');
      throw error;
    }
  }));

  app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || '');
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    const valid = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid) throw httpError(401, 'E-Mail-Adresse oder Passwort ist falsch.', 'INVALID_LOGIN');
    await createSession(res, user.id);
    res.json({ user: serializeUser(user) });
  }));

  app.post('/api/auth/logout', requireAuth, asyncHandler(async (req, res) => {
    await removeSession(req, res);
    res.status(204).end();
  }));

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: serializeUser(req.user) });
  });

  app.post('/api/auth/resend-verification', requireAuth, asyncHandler(async (req, res) => {
    if (req.user.email_verified_at) return res.json({ alreadyVerified: true });
    const verification = await issueEmailToken(req.user, 'verify');
    res.json({
      sent: true,
      emailDelivery: verification.delivery.mode,
      debugUrl: verification.delivery.mode === 'log' ? verification.url : undefined
    });
  }));

  app.post('/api/auth/verify-email', asyncHandler(async (req, res) => {
    const token = String(req.body.token || '');
    if (!token) throw httpError(400, 'Bestätigungslink ist ungültig.', 'INVALID_TOKEN');
    const tokenHash = hashToken(token);

    const user = await db.withTransaction(async (client) => {
      const tokenResult = await client.query(
        `SELECT et.id AS token_id, et.user_id, et.purpose, et.token_hash, et.expires_at, et.used_at,
                u.id AS account_id, u.email, u.name, u.password_hash, u.email_verified_at, u.created_at, u.updated_at
         FROM email_tokens et
         JOIN users u ON u.id = et.user_id
         WHERE et.token_hash = $1 AND et.purpose = 'verify'
           AND et.used_at IS NULL AND et.expires_at > now()
         FOR UPDATE`,
        [tokenHash]
      );
      if (!tokenResult.rowCount) throw httpError(400, 'Der Bestätigungslink ist ungültig oder abgelaufen.', 'INVALID_TOKEN');
      const row = tokenResult.rows[0];
      await client.query('UPDATE email_tokens SET used_at = now() WHERE id = $1', [row.token_id]);
      const updated = await client.query(
        `UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()), updated_at = now()
         WHERE id = $1 RETURNING *`,
        [row.user_id]
      );
      return updated.rows[0];
    });

    res.json({ user: serializeUser(user) });
  }));

  app.post('/api/auth/request-password-reset', asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body.email);
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    let debugUrl;
    if (result.rowCount) {
      const reset = await issueEmailToken(result.rows[0], 'reset');
      if (reset.delivery.mode === 'log') debugUrl = reset.url;
    }
    res.json({ sent: true, debugUrl });
  }));

  app.post('/api/auth/reset-password', asyncHandler(async (req, res) => {
    const token = String(req.body.token || '');
    const password = validatePassword(req.body.password);
    const tokenHash = hashToken(token);
    const passwordHash = await bcrypt.hash(password, 12);

    await db.withTransaction(async (client) => {
      const result = await client.query(
        `SELECT * FROM email_tokens
         WHERE token_hash = $1 AND purpose = 'reset'
           AND used_at IS NULL AND expires_at > now()
         FOR UPDATE`,
        [tokenHash]
      );
      if (!result.rowCount) throw httpError(400, 'Der Link ist ungültig oder abgelaufen.', 'INVALID_TOKEN');
      const row = result.rows[0];
      await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, row.user_id]);
      await client.query('UPDATE email_tokens SET used_at = now() WHERE id = $1', [row.token_id]);
      await client.query('DELETE FROM sessions WHERE user_id = $1', [row.user_id]);
    });

    res.json({ changed: true });
  }));

  app.get('/api/connections', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT tc.id, tc.created_at,
              CASE WHEN tc.user_a_id = $1 THEN b.id ELSE a.id END AS person_id,
              CASE WHEN tc.user_a_id = $1 THEN b.name ELSE a.name END AS person_name,
              CASE WHEN tc.user_a_id = $1 THEN b.email ELSE a.email END AS person_email
       FROM trust_connections tc
       JOIN users a ON a.id = tc.user_a_id
       JOIN users b ON b.id = tc.user_b_id
       WHERE tc.revoked_at IS NULL AND (tc.user_a_id = $1 OR tc.user_b_id = $1)
       ORDER BY person_name`,
      [req.user.id]
    );
    res.json({
      connections: result.rows.map((row) => ({
        id: row.id,
        person: { id: row.person_id, name: row.person_name, email: row.person_email },
        createdAt: row.created_at
      }))
    });
  }));

  app.delete('/api/connections/:id', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(
      `UPDATE trust_connections SET revoked_at = now()
       WHERE id = $1 AND revoked_at IS NULL AND (user_a_id = $2 OR user_b_id = $2)
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rowCount) throw httpError(404, 'Verbindung nicht gefunden.', 'NOT_FOUND');
    res.status(204).end();
  }));

  app.get('/api/invitations/pending', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT i.id, i.expires_at, i.created_at, u.name AS creator_name, u.email AS creator_email
       FROM invitations i
       JOIN users u ON u.id = i.created_by
       WHERE i.status = 'pending' AND i.expires_at > now() AND i.invited_email = $1
       ORDER BY i.created_at DESC`,
      [req.user.email]
    );
    res.json({ invitations: result.rows.map((row) => ({
      id: row.id,
      creatorName: row.creator_name,
      creatorEmail: row.creator_email,
      expiresAt: row.expires_at,
      createdAt: row.created_at
    })) });
  }));

  app.post('/api/invitations', requireAuth, requireVerified, asyncHandler(async (req, res) => {
    const invitedEmail = req.body.email ? validateEmail(req.body.email) : null;
    if (invitedEmail === req.user.email) throw httpError(400, 'Du kannst dich nicht selbst einladen.', 'SELF_INVITE');
    const code = randomCode(8);
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO invitations (id, created_by, invited_email, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, req.user.id, invitedEmail, hashToken(code), expiresAt]
    );

    let delivery = { mode: 'manual' };
    if (invitedEmail) {
      const url = `${config.appBaseUrl}/#invite=${encodeURIComponent(code)}`;
      delivery = await deliverEmail({
        to: invitedEmail,
        subject: `${req.user.name} lädt dich zu ZweiCheck ein`,
        text: `${req.user.name} möchte dich als Vertrauensperson bei ZweiCheck verbinden.\n\nÖffne diesen Link:\n${url}\n\nOder gib den Code ${code} in ZweiCheck ein. Der Code ist 48 Stunden gültig.`
      });
    }

    res.status(201).json({ code, expiresAt, emailDelivery: delivery.mode });
  }));

  app.post('/api/invitations/accept', requireAuth, requireVerified, asyncHandler(async (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (code.length < 6) throw httpError(400, 'Bitte gib einen gültigen Einladungscode ein.', 'INVALID_CODE');

    const connection = await db.withTransaction(async (client) => {
      const invitationResult = await client.query(
        `SELECT * FROM invitations
         WHERE code_hash = $1 AND status = 'pending' AND expires_at > now()
         FOR UPDATE`,
        [hashToken(code)]
      );
      if (!invitationResult.rowCount) throw httpError(400, 'Der Einladungscode ist ungültig oder abgelaufen.', 'INVALID_CODE');
      const invitation = invitationResult.rows[0];
      if (invitation.created_by === req.user.id) throw httpError(400, 'Du kannst deine eigene Einladung nicht annehmen.', 'SELF_INVITE');
      if (invitation.invited_email && invitation.invited_email !== req.user.email) {
        throw httpError(403, 'Diese Einladung ist für eine andere E-Mail-Adresse bestimmt.', 'INVITE_EMAIL_MISMATCH');
      }

      const existing = await activeConnection(invitation.created_by, req.user.id, client);
      let connectionId = existing?.id;
      if (!connectionId) {
        const [userA, userB] = samePair(invitation.created_by, req.user.id);
        connectionId = crypto.randomUUID();
        await client.query(
          `INSERT INTO trust_connections (id, user_a_id, user_b_id, created_by)
           VALUES ($1, $2, $3, $4)`,
          [connectionId, userA, userB, invitation.created_by]
        );
      }

      await client.query(
        `UPDATE invitations
         SET status = 'accepted', accepted_by = $1, accepted_at = now()
         WHERE id = $2`,
        [req.user.id, invitation.id]
      );
      return connectionId;
    });

    res.json({ connectionId: connection });
  }));

  app.post('/api/invitations/:id/decline', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(
      `UPDATE invitations SET status = 'declined'
       WHERE id = $1 AND status = 'pending' AND invited_email = $2
       RETURNING id`,
      [req.params.id, req.user.email]
    );
    if (!result.rowCount) throw httpError(404, 'Einladung nicht gefunden.', 'NOT_FOUND');
    res.status(204).end();
  }));

  app.get('/api/checks', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT c.*, requester.name AS requester_name, reviewer.name AS reviewer_name,
              COUNT(a.id)::int AS attachment_count
       FROM check_requests c
       JOIN users requester ON requester.id = c.requester_id
       JOIN users reviewer ON reviewer.id = c.reviewer_id
       LEFT JOIN attachments a ON a.check_id = c.id
       WHERE c.requester_id = $1
          OR (c.reviewer_id = $1 AND EXISTS (
            SELECT 1 FROM trust_connections tc
            WHERE tc.revoked_at IS NULL
              AND ((tc.user_a_id = c.requester_id AND tc.user_b_id = c.reviewer_id)
                OR (tc.user_a_id = c.reviewer_id AND tc.user_b_id = c.requester_id))
          ))
       GROUP BY c.id, requester.name, reviewer.name
       ORDER BY c.created_at DESC
       LIMIT 200`,
      [req.user.id]
    );
    res.json({ checks: result.rows.map((row) => ({ ...serializeCheck(row), attachmentCount: row.attachment_count })) });
  }));

  app.post('/api/checks', requireAuth, requireVerified, upload.array('images', 3), asyncHandler(async (req, res) => {
    try {
      await validateUploadedImages(req.files || []);
      const reviewerId = String(req.body.reviewerId || '');
      if (!reviewerId || reviewerId === req.user.id) throw httpError(400, 'Bitte wähle eine Vertrauensperson aus.', 'INVALID_REVIEWER');
      const connection = await activeConnection(req.user.id, reviewerId);
      if (!connection) throw httpError(403, 'Diese Vertrauensverbindung ist nicht aktiv.', 'CONNECTION_REQUIRED');

      const category = validateCategory(req.body.category);
      const description = validateText(req.body.description, { name: 'Beschreibung', min: 5, max: 1500 });
      const urgency = validateUrgency(req.body.urgency);
      const amountCents = parseAmountToCents(req.body.amount);
      const checkId = crypto.randomUUID();

      const check = await db.withTransaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO check_requests
             (id, requester_id, reviewer_id, category, description, amount_cents, urgency)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [checkId, req.user.id, reviewerId, category, description, amountCents, urgency]
        );
        for (const file of req.files || []) {
          await client.query(
            `INSERT INTO attachments
               (id, check_id, uploaded_by, original_name, stored_name, mime_type, size_bytes)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [crypto.randomUUID(), checkId, req.user.id, file.originalname.slice(0, 255), file.filename, file.mimetype, file.size]
          );
        }
        return inserted.rows[0];
      });

      const requester = req.user.name;
      const reviewerResult = await db.query('SELECT name FROM users WHERE id = $1', [reviewerId]);
      res.status(201).json({
        check: serializeCheck({ ...check, requester_name: requester, reviewer_name: reviewerResult.rows[0]?.name || 'Vertrauensperson' })
      });
    } catch (error) {
      await removeUploadedFiles(req.files);
      throw error;
    }
  }));

  app.get('/api/checks/:id', requireAuth, asyncHandler(async (req, res) => {
    const check = await fetchCheckForUser(req.params.id, req.user.id);
    if (!check) throw httpError(404, 'Prüfung nicht gefunden.', 'NOT_FOUND');
    const attachments = await db.query('SELECT * FROM attachments WHERE check_id = $1 ORDER BY created_at', [check.id]);
    res.json({ check: serializeCheck(check, attachments.rows) });
  }));

  app.post('/api/checks/:id/respond', requireAuth, requireVerified, asyncHandler(async (req, res) => {
    const recommendation = validateRecommendation(req.body.recommendation);
    const note = optionalText(req.body.note, 1200);
    const result = await db.query(
      `UPDATE check_requests c
       SET status = 'answered', recommendation = $1, response_note = $2,
           responded_at = now(), updated_at = now()
       WHERE c.id = $3 AND c.reviewer_id = $4 AND c.status = 'open'
         AND EXISTS (
           SELECT 1 FROM trust_connections tc
           WHERE tc.revoked_at IS NULL
             AND ((tc.user_a_id = c.requester_id AND tc.user_b_id = c.reviewer_id)
               OR (tc.user_a_id = c.reviewer_id AND tc.user_b_id = c.requester_id))
         )
       RETURNING *`,
      [recommendation, note, req.params.id, req.user.id]
    );
    if (!result.rowCount) throw httpError(409, 'Diese Prüfung kann nicht mehr beantwortet werden.', 'CHECK_NOT_OPEN');
    const check = await fetchCheckForUser(req.params.id, req.user.id);
    res.json({ check: serializeCheck(check) });
  }));

  app.post('/api/checks/:id/close', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(
      `UPDATE check_requests
       SET status = 'closed', closed_at = now(), updated_at = now()
       WHERE id = $1 AND requester_id = $2 AND status <> 'closed'
       RETURNING id`,
      [req.params.id, req.user.id]
    );
    if (!result.rowCount) throw httpError(409, 'Diese Prüfung kann nicht abgeschlossen werden.', 'CHECK_NOT_CLOSABLE');
    res.json({ closed: true });
  }));

  app.get('/api/attachments/:id', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(
      `SELECT a.*, c.requester_id, c.reviewer_id,
              EXISTS (
                SELECT 1 FROM trust_connections tc
                WHERE tc.revoked_at IS NULL
                  AND ((tc.user_a_id = c.requester_id AND tc.user_b_id = c.reviewer_id)
                    OR (tc.user_a_id = c.reviewer_id AND tc.user_b_id = c.requester_id))
              ) AS connection_active
       FROM attachments a
       JOIN check_requests c ON c.id = a.check_id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (!result.rowCount) throw httpError(404, 'Datei nicht gefunden.', 'NOT_FOUND');
    const row = result.rows[0];
    const allowed = row.requester_id === req.user.id || (row.reviewer_id === req.user.id && row.connection_active);
    if (!allowed) throw httpError(404, 'Datei nicht gefunden.', 'NOT_FOUND');
    res.type(row.mime_type);
    res.set('Cache-Control', 'private, max-age=300');
    res.sendFile(path.join(config.uploadDir, row.stored_name));
  }));

  const publicRoot = process.cwd();
  const sendPublic = (fileName, cacheControl = 'public, max-age=3600') => (_req, res) => {
    res.set('Cache-Control', cacheControl);
    res.sendFile(path.join(publicRoot, fileName));
  };
  app.get('/app.js', sendPublic('app.js'));
  app.get('/app.css', sendPublic('app.css'));
  app.get('/manifest.webmanifest', sendPublic('manifest.webmanifest', 'no-cache'));
  app.get('/sw.js', sendPublic('sw.js', 'no-cache'));
  app.use('/assets/brand', express.static(path.join(publicRoot, 'assets', 'brand'), {
    etag: true,
    maxAge: '7d',
    fallthrough: false
  }));

  app.use('/api', (_req, _res, next) => next(httpError(404, 'API-Endpunkt nicht gefunden.', 'NOT_FOUND')));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.set('Cache-Control', 'no-cache');
    return res.sendFile(path.join(publicRoot, 'index.html'));
  });

  app.use((error, req, res, _next) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? `Ein Bild darf höchstens ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB groß sein.`
        : 'Die Bilder konnten nicht hochgeladen werden.';
      return res.status(400).json({ error: message, code: error.code });
    }

    const status = Number(error.status) || 500;
    if (status >= 500) console.error('[server]', error);
    const message = status >= 500 ? 'Etwas ist schiefgelaufen. Bitte versuche es erneut.' : error.message;
    if (req.path.startsWith('/api/')) {
      return res.status(status).json({ error: message, code: error.code || 'SERVER_ERROR' });
    }
    return res.status(status).type('text/plain').send(message);
  });

  return app;
}

async function start() {
  await fs.mkdir(config.uploadDir, { recursive: true });
  await db.waitForDb();
  await db.migrate();
  await db.query('DELETE FROM sessions WHERE expires_at <= now()');
  await db.query(`UPDATE invitations SET status = 'revoked' WHERE status = 'pending' AND expires_at <= now()`);

  const app = buildApp();
  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[server] ZweiCheck läuft auf Port ${config.port}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error('[server] Start fehlgeschlagen:', error);
    process.exit(1);
  });
}

module.exports = { buildApp, start, serializeUser, serializeCheck };
