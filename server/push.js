const crypto = require('node:crypto');
const webpush = require('web-push');

const { config } = require('./config');
const db = require('./db');

const CATEGORY_LABELS = {
  message: 'Nachricht oder Anruf',
  payment: 'Zahlung oder Rechnung',
  link: 'Link, QR-Code oder App',
  data: 'Daten oder Dokumente'
};

const RECOMMENDATION_LABELS = {
  do_not_act: 'Nicht handeln',
  verify_personally: 'Erst persönlich klären',
  plausible: 'Wirkt nachvollziehbar',
  call_me: 'Ruf mich jetzt an'
};

let configured = false;
let workerRunning = false;
let initialTimer = null;
let intervalTimer = null;

function isPushEnabled() {
  return Boolean(
    config.push.publicKey
    && config.push.privateKey
    && config.push.subject
  );
}

function configureWebPush() {
  if (!isPushEnabled() || configured) return isPushEnabled();
  webpush.setVapidDetails(
    config.push.subject,
    config.push.publicKey,
    config.push.privateKey
  );
  configured = true;
  return true;
}

function validateSubscription(input) {
  const endpoint = String(input?.endpoint || '').trim();
  const p256dh = String(input?.keys?.p256dh || '').trim();
  const auth = String(input?.keys?.auth || '').trim();

  let endpointUrl;
  try {
    endpointUrl = new URL(endpoint);
  } catch {
    throw new Error('Die Push-Adresse ist ungültig.');
  }

  if (endpointUrl.protocol !== 'https:' || endpoint.length > 2048) {
    throw new Error('Die Push-Adresse ist ungültig.');
  }
  if (!p256dh || p256dh.length > 512 || !auth || auth.length > 256) {
    throw new Error('Die Push-Schlüssel sind ungültig.');
  }

  return { endpoint, keys: { p256dh, auth } };
}

function registerPushRoutes(app, {
  requireAuth,
  requireVerified,
  asyncHandler,
  httpError
}) {
  app.get('/api/push/config', requireAuth, (_req, res) => {
    res.json({
      enabled: isPushEnabled(),
      publicKey: isPushEnabled() ? config.push.publicKey : null
    });
  });

  app.get('/api/push/status', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(
      'SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ subscriptions: result.rows[0]?.count || 0 });
  }));

  app.post('/api/push/subscriptions', requireAuth, requireVerified, asyncHandler(async (req, res) => {
    if (!isPushEnabled()) {
      throw httpError(503, 'Push-Benachrichtigungen sind noch nicht eingerichtet.', 'PUSH_NOT_CONFIGURED');
    }

    let subscription;
    try {
      subscription = validateSubscription(req.body?.subscription);
    } catch (error) {
      throw httpError(400, error.message, 'INVALID_PUSH_SUBSCRIPTION');
    }

    await db.query(
      `INSERT INTO push_subscriptions
         (id, user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())
       ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           user_agent = EXCLUDED.user_agent,
           updated_at = now()`,
      [
        crypto.randomUUID(),
        req.user.id,
        subscription.endpoint,
        subscription.keys.p256dh,
        subscription.keys.auth,
        String(req.get('user-agent') || '').slice(0, 500)
      ]
    );

    res.status(201).json({ saved: true });
  }));

  app.delete('/api/push/subscriptions', requireAuth, asyncHandler(async (req, res) => {
    const endpoint = String(req.body?.endpoint || '').trim();
    if (!endpoint) throw httpError(400, 'Push-Adresse fehlt.', 'PUSH_ENDPOINT_REQUIRED');

    await db.query(
      'DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [req.user.id, endpoint]
    );
    res.status(204).end();
  }));
}

async function ensureWorkerState() {
  await db.query(`
    INSERT INTO push_worker_state (id, activated_at)
    VALUES (TRUE, now())
    ON CONFLICT (id) DO NOTHING
  `);

  await db.query(`
    UPDATE push_notifications
    SET status = 'failed',
        next_attempt_at = now(),
        last_error = COALESCE(last_error, 'Versand nach Neustart erneut eingeplant'),
        updated_at = now()
    WHERE status = 'sending' AND updated_at < now() - interval '10 minutes'
  `);
}

async function enqueueMissingNotifications() {
  await db.query(`
    INSERT INTO push_notifications (check_id, event_type)
    SELECT c.id, 'check_created'
    FROM check_requests c
    CROSS JOIN push_worker_state state
    WHERE state.id = TRUE
      AND c.created_at >= state.activated_at
    ON CONFLICT (check_id, event_type) DO NOTHING;

    INSERT INTO push_notifications (check_id, event_type)
    SELECT c.id, 'check_answered'
    FROM check_requests c
    CROSS JOIN push_worker_state state
    WHERE state.id = TRUE
      AND c.responded_at IS NOT NULL
      AND c.responded_at >= state.activated_at
    ON CONFLICT (check_id, event_type) DO NOTHING;
  `);
}

async function claimNotification() {
  return db.withTransaction(async (client) => {
    const selected = await client.query(`
      SELECT id, check_id, event_type, attempts
      FROM push_notifications
      WHERE status IN ('pending', 'failed')
        AND next_attempt_at <= now()
      ORDER BY created_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);

    if (!selected.rowCount) return null;
    const row = selected.rows[0];
    const claimed = await client.query(`
      UPDATE push_notifications
      SET status = 'sending', attempts = attempts + 1, updated_at = now()
      WHERE id = $1
      RETURNING id, check_id, event_type, attempts
    `, [row.id]);
    return claimed.rows[0];
  });
}

async function loadPushData(checkId) {
  const result = await db.query(`
    SELECT c.id, c.requester_id, c.reviewer_id, c.category, c.recommendation,
           requester.name AS requester_name,
           reviewer.name AS reviewer_name
    FROM check_requests c
    JOIN users requester ON requester.id = c.requester_id
    JOIN users reviewer ON reviewer.id = c.reviewer_id
    WHERE c.id = $1
  `, [checkId]);
  return result.rows[0] || null;
}

function buildPushPayload(eventType, row) {
  const url = `${config.appBaseUrl}/#check=${encodeURIComponent(row.id)}`;

  if (eventType === 'check_created') {
    return {
      userId: row.reviewer_id,
      payload: {
        title: 'Neue Prüfanfrage',
        body: `${row.requester_name} braucht deinen zweiten Blick – ${CATEGORY_LABELS[row.category] || 'Prüfanfrage'}.`,
        url,
        tag: `zc-created-${row.id}`,
        eventType,
        checkId: row.id
      }
    };
  }

  if (eventType === 'check_answered') {
    return {
      userId: row.requester_id,
      payload: {
        title: 'Deine Prüfanfrage wurde beantwortet',
        body: `${row.reviewer_name}: ${RECOMMENDATION_LABELS[row.recommendation] || 'Eine Rückmeldung liegt vor'}.`,
        url,
        tag: `zc-answered-${row.id}`,
        eventType,
        checkId: row.id
      }
    };
  }

  throw new Error(`Unbekannter Push-Typ: ${eventType}`);
}

function isExpiredPushError(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}

async function markNotification(id, status, lastError = null) {
  await db.query(`
    UPDATE push_notifications
    SET status = $2,
        sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
        last_error = $3,
        updated_at = now()
    WHERE id = $1
  `, [id, status, lastError]);
}

async function markFailed(job, error) {
  const delaySeconds = Math.min(1800, 30 * (2 ** Math.max(0, job.attempts - 1)));
  const message = String(error?.message || error || 'Unbekannter Push-Fehler').slice(0, 1000);
  await db.query(`
    UPDATE push_notifications
    SET status = 'failed',
        next_attempt_at = now() + ($2 * interval '1 second'),
        last_error = $3,
        updated_at = now()
    WHERE id = $1
  `, [job.id, delaySeconds, message]);
}

async function processNotification(job) {
  const row = await loadPushData(job.check_id);
  if (!row) {
    await markNotification(job.id, 'skipped', 'Prüfanfrage nicht mehr vorhanden');
    return;
  }

  const { userId, payload } = buildPushPayload(job.event_type, row);
  const subscriptions = await db.query(
    `SELECT id, endpoint, p256dh, auth
     FROM push_subscriptions
     WHERE user_id = $1
     ORDER BY created_at`,
    [userId]
  );

  if (!subscriptions.rowCount) {
    await markNotification(job.id, 'skipped', 'Keine aktive Push-Anmeldung');
    return;
  }

  let sent = 0;
  const transientErrors = [];

  for (const subscription of subscriptions.rows) {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth }
      }, JSON.stringify(payload), {
        TTL: 300,
        urgency: 'high'
      });
      sent += 1;
    } catch (error) {
      if (isExpiredPushError(error)) {
        await db.query('DELETE FROM push_subscriptions WHERE id = $1', [subscription.id]);
      } else {
        transientErrors.push(error);
      }
    }
  }

  if (sent > 0) {
    await markNotification(job.id, 'sent');
    return;
  }

  if (transientErrors.length) throw transientErrors[0];
  await markNotification(job.id, 'skipped', 'Keine erreichbare Push-Anmeldung');
}

async function runPushWorkerOnce({ maxJobs = 30 } = {}) {
  if (!configureWebPush()) return { processed: 0, disabled: true };
  if (workerRunning) return { processed: 0, skipped: true };

  workerRunning = true;
  let processed = 0;
  try {
    await ensureWorkerState();
    await enqueueMissingNotifications();

    while (processed < maxJobs) {
      const job = await claimNotification();
      if (!job) break;
      try {
        await processNotification(job);
      } catch (error) {
        await markFailed(job, error);
        console.error(`[push-worker] Versand für ${job.event_type}/${job.check_id} fehlgeschlagen:`, error.message);
      }
      processed += 1;
    }

    return { processed, disabled: false };
  } finally {
    workerRunning = false;
  }
}

function startPushWorker() {
  if (!configureWebPush() || initialTimer || intervalTimer) return;

  const execute = () => {
    runPushWorkerOnce().catch((error) => {
      console.error('[push-worker] Durchlauf fehlgeschlagen:', error.message);
    });
  };

  initialTimer = setTimeout(() => {
    initialTimer = null;
    execute();
  }, 5_000);
  initialTimer.unref?.();

  intervalTimer = setInterval(execute, 15_000);
  intervalTimer.unref?.();
}

module.exports = {
  isPushEnabled,
  validateSubscription,
  registerPushRoutes,
  buildPushPayload,
  isExpiredPushError,
  runPushWorkerOnce,
  startPushWorker
};
