const { config } = require('./config');
const db = require('./db');
const { newCheckEmail, checkAnsweredEmail } = require('./email-template');

const CATEGORY_LABELS = {
  message: 'Nachricht oder Anruf',
  payment: 'Zahlung oder Rechnung',
  link: 'Link, QR-Code oder App',
  data: 'Daten oder Dokumente'
};

const URGENCY_LABELS = {
  none: 'Kein Zeitdruck',
  low: 'Etwas dringend',
  high: 'Dringend',
  very_high: 'Sehr dringend'
};

const RECOMMENDATION_LABELS = {
  do_not_act: 'Nicht handeln',
  verify_personally: 'Erst persönlich klären',
  plausible: 'Wirkt nachvollziehbar',
  call_me: 'Ruf mich jetzt an'
};

let initialized = false;
let running = false;
let initialTimer = null;
let intervalTimer = null;

async function ensureNotificationSchema() {
  if (initialized) return;

  const existing = await db.query("SELECT to_regclass('public.email_notifications') AS table_name");
  const tableExisted = Boolean(existing.rows[0]?.table_name);

  await db.query(`
    CREATE TABLE IF NOT EXISTS email_notifications (
      id BIGSERIAL PRIMARY KEY,
      check_id UUID NOT NULL REFERENCES check_requests(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL CHECK (event_type IN ('check_created', 'check_answered')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_error TEXT,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (check_id, event_type)
    );
    CREATE INDEX IF NOT EXISTS email_notifications_due_idx
      ON email_notifications (status, next_attempt_at, created_at);
  `);

  if (!tableExisted) {
    await db.query(`
      INSERT INTO email_notifications (check_id, event_type, status, sent_at)
      SELECT id, 'check_created', 'skipped', now()
      FROM check_requests
      ON CONFLICT (check_id, event_type) DO NOTHING;

      INSERT INTO email_notifications (check_id, event_type, status, sent_at)
      SELECT id, 'check_answered', 'skipped', now()
      FROM check_requests
      WHERE responded_at IS NOT NULL
      ON CONFLICT (check_id, event_type) DO NOTHING;
    `);
  }

  await db.query(`
    UPDATE email_notifications
    SET status = 'failed',
        next_attempt_at = now(),
        last_error = COALESCE(last_error, 'Versand nach Neustart erneut eingeplant'),
        updated_at = now()
    WHERE status = 'sending' AND updated_at < now() - interval '10 minutes'
  `);

  initialized = true;
}

async function enqueueMissingNotifications() {
  await db.query(`
    INSERT INTO email_notifications (check_id, event_type)
    SELECT id, 'check_created'
    FROM check_requests
    ON CONFLICT (check_id, event_type) DO NOTHING;

    INSERT INTO email_notifications (check_id, event_type)
    SELECT id, 'check_answered'
    FROM check_requests
    WHERE responded_at IS NOT NULL
    ON CONFLICT (check_id, event_type) DO NOTHING;
  `);
}

async function claimNotification() {
  return db.withTransaction(async (client) => {
    const selected = await client.query(`
      SELECT id, check_id, event_type, attempts
      FROM email_notifications
      WHERE status IN ('pending', 'failed')
        AND next_attempt_at <= now()
      ORDER BY created_at, id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);

    if (!selected.rowCount) return null;
    const row = selected.rows[0];
    const claimed = await client.query(`
      UPDATE email_notifications
      SET status = 'sending', attempts = attempts + 1, updated_at = now()
      WHERE id = $1
      RETURNING id, check_id, event_type, attempts
    `, [row.id]);
    return claimed.rows[0];
  });
}

async function loadCheckNotificationData(checkId) {
  const result = await db.query(`
    SELECT c.id, c.category, c.urgency, c.recommendation,
           requester.name AS requester_name,
           requester.email AS requester_email,
           reviewer.name AS reviewer_name,
           reviewer.email AS reviewer_email
    FROM check_requests c
    JOIN users requester ON requester.id = c.requester_id
    JOIN users reviewer ON reviewer.id = c.reviewer_id
    WHERE c.id = $1
  `, [checkId]);
  return result.rows[0] || null;
}

function buildNotificationMessage(eventType, row) {
  const actionUrl = `${config.appBaseUrl}/#check=${encodeURIComponent(row.id)}`;

  if (eventType === 'check_created') {
    const content = newCheckEmail({
      recipientName: row.reviewer_name,
      requesterName: row.requester_name,
      category: CATEGORY_LABELS[row.category] || 'Prüfanfrage',
      urgency: URGENCY_LABELS[row.urgency] || 'Nicht angegeben',
      actionUrl
    });
    return { to: row.reviewer_email, ...content };
  }

  if (eventType === 'check_answered') {
    const content = checkAnsweredEmail({
      recipientName: row.requester_name,
      reviewerName: row.reviewer_name,
      recommendation: RECOMMENDATION_LABELS[row.recommendation] || 'Rückmeldung liegt vor',
      actionUrl
    });
    return { to: row.requester_email, ...content };
  }

  throw new Error(`Unbekannter Benachrichtigungstyp: ${eventType}`);
}

async function markSent(id) {
  await db.query(`
    UPDATE email_notifications
    SET status = 'sent', sent_at = now(), last_error = NULL, updated_at = now()
    WHERE id = $1
  `, [id]);
}

async function markFailed(job, error) {
  const delaySeconds = Math.min(3600, 60 * (2 ** Math.max(0, job.attempts - 1)));
  const message = String(error?.message || error || 'Unbekannter Versandfehler').slice(0, 1000);
  await db.query(`
    UPDATE email_notifications
    SET status = 'failed',
        next_attempt_at = now() + ($2 * interval '1 second'),
        last_error = $3,
        updated_at = now()
    WHERE id = $1
  `, [job.id, delaySeconds, message]);
}

async function processNotification(job, deliverEmail) {
  const row = await loadCheckNotificationData(job.check_id);
  if (!row) {
    await db.query(`
      UPDATE email_notifications
      SET status = 'skipped', last_error = 'Prüfanfrage nicht mehr vorhanden', updated_at = now()
      WHERE id = $1
    `, [job.id]);
    return;
  }

  const message = buildNotificationMessage(job.event_type, row);
  await deliverEmail(message);
  await markSent(job.id);
}

async function runNotificationWorkerOnce({ deliverEmail, maxJobs = 20 }) {
  if (running) return { processed: 0, skipped: true };
  running = true;
  let processed = 0;

  try {
    await ensureNotificationSchema();
    await enqueueMissingNotifications();

    while (processed < maxJobs) {
      const job = await claimNotification();
      if (!job) break;
      try {
        await processNotification(job, deliverEmail);
      } catch (error) {
        await markFailed(job, error);
        console.error(`[email-worker] Versand für ${job.event_type}/${job.check_id} fehlgeschlagen:`, error.message);
      }
      processed += 1;
    }

    return { processed, skipped: false };
  } finally {
    running = false;
  }
}

function startNotificationWorker({ deliverEmail }) {
  if (initialTimer || intervalTimer || config.emailMode !== 'smtp') return;

  const execute = () => {
    runNotificationWorkerOnce({ deliverEmail }).catch((error) => {
      initialized = false;
      console.error('[email-worker] Durchlauf fehlgeschlagen:', error.message);
    });
  };

  initialTimer = setTimeout(() => {
    initialTimer = null;
    execute();
  }, 8_000);
  initialTimer.unref?.();

  intervalTimer = setInterval(execute, 30_000);
  intervalTimer.unref?.();
}

module.exports = {
  CATEGORY_LABELS,
  URGENCY_LABELS,
  RECOMMENDATION_LABELS,
  buildNotificationMessage,
  runNotificationWorkerOnce,
  startNotificationWorker
};
