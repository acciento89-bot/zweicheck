const db = require('./db');

const ALLOWED_REMINDER_MINUTES = new Set([5, 15, 30, 60, 120]);
const AUTO_REROUTE_DELAY_MINUTES = 15;

let schemaReady = false;
let workerRunning = false;
let initialTimer = null;
let intervalTimer = null;

function inputError(message, code = 'INVALID_ESCALATION') {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

function normalizeReminderMinutes(value) {
  if (value === null || value === undefined || value === '' || Number(value) === 0) return null;
  const parsed = Number.parseInt(String(value), 10);
  return ALLOWED_REMINDER_MINUTES.has(parsed) ? parsed : null;
}

function normalizeAutoReroute(value) {
  if (value === true || value === 1) return true;
  const normalized = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'on', 'yes'].includes(normalized);
}

async function ensureEscalationSchema() {
  if (schemaReady) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS check_escalations (
      check_id uuid PRIMARY KEY REFERENCES check_requests(id) ON DELETE CASCADE,
      reminder_minutes integer NOT NULL CHECK (reminder_minutes IN (5, 15, 30, 60, 120)),
      reminder_at timestamptz NOT NULL,
      auto_reroute boolean NOT NULL DEFAULT false,
      reroute_at timestamptz,
      reminded_at timestamptz,
      rerouted_at timestamptz,
      cancelled_at timestamptz,
      last_error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CHECK ((auto_reroute = false AND reroute_at IS NULL) OR (auto_reroute = true AND reroute_at IS NOT NULL))
    );
    CREATE INDEX IF NOT EXISTS check_escalations_due_reminder_idx
      ON check_escalations(reminder_at)
      WHERE reminded_at IS NULL AND cancelled_at IS NULL AND rerouted_at IS NULL;
    CREATE INDEX IF NOT EXISTS check_escalations_due_reroute_idx
      ON check_escalations(reroute_at)
      WHERE auto_reroute = true AND cancelled_at IS NULL AND rerouted_at IS NULL;

    ALTER TABLE activities
      DROP CONSTRAINT IF EXISTS activities_event_type_check;
    ALTER TABLE activities
      ADD CONSTRAINT activities_event_type_check
      CHECK (event_type IN (
        'check_created',
        'check_answered',
        'check_closed',
        'check_reminder',
        'invitation_received',
        'invitation_accepted',
        'invitation_declined',
        'connection_revoked'
      ));

    ALTER TABLE push_notifications
      DROP CONSTRAINT IF EXISTS push_notifications_event_type_check;
    ALTER TABLE push_notifications
      ADD CONSTRAINT push_notifications_event_type_check
      CHECK (event_type IN ('check_created', 'check_answered', 'check_rerouted', 'check_reminder'));

    CREATE OR REPLACE FUNCTION zc_cancel_check_escalation()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.status <> 'open' OR NEW.reassigned_at IS NOT NULL THEN
        UPDATE check_escalations
        SET cancelled_at = COALESCE(cancelled_at, now()),
            updated_at = now()
        WHERE check_id = NEW.id
          AND rerouted_at IS NULL
          AND cancelled_at IS NULL;

        UPDATE push_notifications
        SET status = 'skipped',
            last_error = 'Eskalation ist nicht mehr aktiv',
            updated_at = now()
        WHERE check_id = NEW.id
          AND event_type = 'check_reminder'
          AND status IN ('pending', 'failed');

        IF to_regclass('public.email_notifications') IS NOT NULL THEN
          EXECUTE 'UPDATE email_notifications
                   SET status = ''skipped'', last_error = ''Eskalation ist nicht mehr aktiv'', updated_at = now()
                   WHERE check_id = $1 AND event_type = ''check_reminder'' AND status IN (''pending'', ''failed'')'
          USING NEW.id;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;

    DROP TRIGGER IF EXISTS check_escalation_cancel_trigger ON check_requests;
    CREATE TRIGGER check_escalation_cancel_trigger
    AFTER UPDATE OF status, reassigned_at ON check_requests
    FOR EACH ROW
    EXECUTE FUNCTION zc_cancel_check_escalation();
  `);

  schemaReady = true;
}

async function createCheckEscalation(client, {
  checkId,
  reminderMinutes: rawReminderMinutes,
  autoReroute: rawAutoReroute,
  fallbackReviewerId
}) {
  const reminderMinutes = normalizeReminderMinutes(rawReminderMinutes);
  const hadReminderInput = rawReminderMinutes !== undefined
    && rawReminderMinutes !== null
    && String(rawReminderMinutes).trim() !== ''
    && Number(rawReminderMinutes) !== 0;

  if (hadReminderInput && !reminderMinutes) {
    throw inputError('Bitte wähle eine gültige Erinnerungszeit aus.', 'INVALID_REMINDER_TIME');
  }
  if (!reminderMinutes) return null;

  const autoReroute = normalizeAutoReroute(rawAutoReroute);
  if (autoReroute && !fallbackReviewerId) {
    throw inputError('Für die automatische Weitergabe brauchst du eine Ausweichperson.', 'ESCALATION_FALLBACK_REQUIRED');
  }

  const result = await client.query(`
    INSERT INTO check_escalations (
      check_id, reminder_minutes, reminder_at, auto_reroute, reroute_at,
      reminded_at, rerouted_at, cancelled_at, last_error, created_at, updated_at
    ) VALUES (
      $1,
      $2,
      now() + ($2::integer * interval '1 minute'),
      $3,
      CASE WHEN $3 THEN now() + (($2::integer + $4::integer) * interval '1 minute') ELSE NULL END,
      NULL, NULL, NULL, NULL, now(), now()
    )
    ON CONFLICT (check_id) DO UPDATE
    SET reminder_minutes = EXCLUDED.reminder_minutes,
        reminder_at = EXCLUDED.reminder_at,
        auto_reroute = EXCLUDED.auto_reroute,
        reroute_at = EXCLUDED.reroute_at,
        reminded_at = NULL,
        rerouted_at = NULL,
        cancelled_at = NULL,
        last_error = NULL,
        updated_at = now()
    RETURNING *
  `, [checkId, reminderMinutes, autoReroute, AUTO_REROUTE_DELAY_MINUTES]);

  return result.rows[0];
}

async function activeConnection(client, firstId, secondId) {
  const result = await client.query(`
    SELECT id
    FROM trust_connections
    WHERE revoked_at IS NULL
      AND ((user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1))
    LIMIT 1
  `, [firstId, secondId]);
  return result.rows[0] || null;
}

async function loadPlanForUser(checkId, userId, client = db) {
  const result = await client.query(`
    SELECT c.id, c.requester_id, c.reviewer_id, c.fallback_reviewer_id,
           c.status, c.reassigned_at,
           e.check_id AS escalation_id, e.reminder_minutes, e.reminder_at,
           e.auto_reroute, e.reroute_at, e.reminded_at, e.rerouted_at,
           e.cancelled_at, e.last_error, e.created_at AS escalation_created_at,
           e.updated_at AS escalation_updated_at,
           fallback.name AS fallback_name
    FROM check_requests c
    LEFT JOIN check_escalations e ON e.check_id = c.id
    LEFT JOIN users fallback ON fallback.id = c.fallback_reviewer_id
    WHERE c.id = $1
      AND (c.requester_id = $2 OR c.reviewer_id = $2)
  `, [checkId, userId]);
  return result.rows[0] || null;
}

function escalationState(row) {
  if (!row?.escalation_id) return 'disabled';
  if (row.rerouted_at) return 'rerouted';
  if (row.cancelled_at) return 'cancelled';
  if (row.reminded_at && row.auto_reroute) return 'waiting_reroute';
  if (row.reminded_at) return 'reminded';
  return 'waiting_reminder';
}

function serializeEscalation(row, userId) {
  const state = escalationState(row);
  const requester = row?.requester_id === userId;
  const exists = Boolean(row?.escalation_id);
  const active = ['waiting_reminder', 'reminded', 'waiting_reroute'].includes(state);
  const canManage = Boolean(
    requester
    && row?.status === 'open'
    && !row?.reassigned_at
    && !row?.rerouted_at
  );

  return {
    checkId: row?.id || null,
    role: requester ? 'requester' : 'reviewer',
    exists,
    enabled: active,
    state,
    reminderMinutes: exists ? row.reminder_minutes : null,
    reminderAt: exists ? row.reminder_at : null,
    remindedAt: exists ? row.reminded_at : null,
    autoReroute: exists ? Boolean(row.auto_reroute) : false,
    autoRerouteDelayMinutes: AUTO_REROUTE_DELAY_MINUTES,
    rerouteAt: exists ? row.reroute_at : null,
    reroutedAt: exists ? row.rerouted_at : null,
    cancelledAt: exists ? row.cancelled_at : null,
    lastError: exists ? row.last_error : null,
    canManage,
    canConfigure: canManage && !row?.reminded_at,
    fallbackReviewer: row?.fallback_reviewer_id ? {
      id: row.fallback_reviewer_id,
      name: row.fallback_name || 'Ausweichperson'
    } : null
  };
}

async function skipReminderNotifications(client, checkId, reason) {
  await client.query(`
    UPDATE push_notifications
    SET status = 'skipped', last_error = $2, updated_at = now()
    WHERE check_id = $1
      AND event_type = 'check_reminder'
      AND status IN ('pending', 'failed')
  `, [checkId, reason]);

  const emailTable = await client.query("SELECT to_regclass('public.email_notifications') AS table_name");
  if (emailTable.rows[0]?.table_name) {
    await client.query(`
      UPDATE email_notifications
      SET status = 'skipped', last_error = $2, updated_at = now()
      WHERE check_id = $1
        AND event_type = 'check_reminder'
        AND status IN ('pending', 'failed')
    `, [checkId, reason]);
  }
}

function registerEscalationRoutes(app, { requireAuth, requireVerified, asyncHandler, httpError }) {
  app.get('/api/checks/:id/escalation', requireAuth, asyncHandler(async (req, res) => {
    const row = await loadPlanForUser(req.params.id, req.user.id);
    if (!row) throw httpError(404, 'Prüfanfrage nicht gefunden.', 'NOT_FOUND');
    res.json({ escalation: serializeEscalation(row, req.user.id) });
  }));

  app.put('/api/checks/:id/escalation', requireAuth, requireVerified, asyncHandler(async (req, res) => {
    await db.withTransaction(async (client) => {
      const locked = await client.query(`
        SELECT c.id, c.requester_id, c.reviewer_id, c.fallback_reviewer_id,
               c.status, c.reassigned_at,
               e.reminded_at, e.rerouted_at, e.cancelled_at
        FROM check_requests c
        LEFT JOIN check_escalations e ON e.check_id = c.id
        WHERE c.id = $1
        FOR UPDATE OF c
      `, [req.params.id]);

      if (!locked.rowCount) throw httpError(404, 'Prüfanfrage nicht gefunden.', 'NOT_FOUND');
      const check = locked.rows[0];
      if (check.requester_id !== req.user.id) {
        throw httpError(403, 'Nur die anfragende Person kann die Eskalation ändern.', 'ESCALATION_FORBIDDEN');
      }
      if (check.status !== 'open' || check.reassigned_at || check.rerouted_at) {
        throw httpError(409, 'Diese Eskalation kann nicht mehr geändert werden.', 'ESCALATION_LOCKED');
      }

      const enabled = req.body?.enabled !== false && String(req.body?.enabled ?? 'true').toLowerCase() !== 'false';
      if (!enabled) {
        await client.query(`
          UPDATE check_escalations
          SET cancelled_at = COALESCE(cancelled_at, now()), updated_at = now()
          WHERE check_id = $1 AND rerouted_at IS NULL
        `, [check.id]);
        await skipReminderNotifications(client, check.id, 'Eskalation wurde von der anfragenden Person gestoppt');
        return;
      }

      if (check.reminded_at) {
        throw httpError(409, 'Die Erinnerung wurde bereits gesendet. Du kannst die Automatik nur noch stoppen.', 'REMINDER_ALREADY_SENT');
      }

      const reminderMinutes = normalizeReminderMinutes(req.body?.reminderMinutes);
      if (!reminderMinutes) {
        throw httpError(400, 'Bitte wähle eine Erinnerungszeit aus.', 'INVALID_REMINDER_TIME');
      }
      const autoReroute = normalizeAutoReroute(req.body?.autoReroute);
      if (autoReroute) {
        if (!check.fallback_reviewer_id) {
          throw httpError(400, 'Für die automatische Weitergabe brauchst du eine Ausweichperson.', 'ESCALATION_FALLBACK_REQUIRED');
        }
        const connection = await activeConnection(client, check.requester_id, check.fallback_reviewer_id);
        if (!connection) {
          throw httpError(409, 'Die Ausweichperson gehört nicht mehr zu deinem aktiven Vertrauenskreis.', 'FALLBACK_CONNECTION_REQUIRED');
        }
      }

      await createCheckEscalation(client, {
        checkId: check.id,
        reminderMinutes,
        autoReroute,
        fallbackReviewerId: check.fallback_reviewer_id
      });
    });

    const row = await loadPlanForUser(req.params.id, req.user.id);
    res.json({ escalation: serializeEscalation(row, req.user.id) });
  }));
}

async function addActivity(client, {
  userId,
  eventType = 'check_reminder',
  actorUserId,
  checkId,
  title,
  body,
  dedupeKey
}) {
  await client.query(
    `SELECT zc_add_activity($1, $2, $3, $4, NULL, NULL, $5, $6, $7)`,
    [userId, eventType, actorUserId || null, checkId, title, body, dedupeKey]
  );
}

async function processDueReminder() {
  return db.withTransaction(async (client) => {
    const selected = await client.query(`
      SELECT e.check_id, e.auto_reroute, e.reroute_at,
             c.requester_id, c.reviewer_id,
             requester.name AS requester_name
      FROM check_escalations e
      JOIN check_requests c ON c.id = e.check_id
      JOIN users requester ON requester.id = c.requester_id
      WHERE e.cancelled_at IS NULL
        AND e.rerouted_at IS NULL
        AND e.reminded_at IS NULL
        AND e.reminder_at <= now()
        AND c.status = 'open'
        AND c.responded_at IS NULL
        AND c.reassigned_at IS NULL
        AND (e.auto_reroute = false OR e.reroute_at IS NULL OR e.reroute_at > now())
      ORDER BY e.reminder_at, e.check_id
      FOR UPDATE OF e, c SKIP LOCKED
      LIMIT 1
    `);
    if (!selected.rowCount) return null;

    const row = selected.rows[0];
    const updated = await client.query(`
      UPDATE check_escalations
      SET reminded_at = now(), updated_at = now(), last_error = NULL
      WHERE check_id = $1 AND reminded_at IS NULL
      RETURNING reminded_at
    `, [row.check_id]);
    if (!updated.rowCount) return null;

    await addActivity(client, {
      userId: row.reviewer_id,
      actorUserId: row.requester_id,
      checkId: row.check_id,
      title: 'Erinnerung: Prüfanfrage wartet',
      body: `${row.requester_name || 'Eine Vertrauensperson'} wartet noch auf deine Einschätzung.`,
      dedupeKey: `check:${row.check_id}:reminder`
    });
    await addActivity(client, {
      userId: row.requester_id,
      actorUserId: row.reviewer_id,
      checkId: row.check_id,
      title: 'Erinnerung wurde gesendet',
      body: 'Deine Vertrauensperson wurde an die offene Prüfanfrage erinnert.',
      dedupeKey: `check:${row.check_id}:reminder-requester`
    });

    return { checkId: row.check_id, remindedAt: updated.rows[0].reminded_at };
  });
}

async function processDueReroute() {
  return db.withTransaction(async (client) => {
    const selected = await client.query(`
      SELECT e.check_id,
             c.requester_id, c.reviewer_id, c.fallback_reviewer_id,
             requester.name AS requester_name,
             reviewer.name AS reviewer_name,
             fallback.name AS fallback_name
      FROM check_escalations e
      JOIN check_requests c ON c.id = e.check_id
      JOIN users requester ON requester.id = c.requester_id
      JOIN users reviewer ON reviewer.id = c.reviewer_id
      LEFT JOIN users fallback ON fallback.id = c.fallback_reviewer_id
      WHERE e.cancelled_at IS NULL
        AND e.rerouted_at IS NULL
        AND e.auto_reroute = true
        AND e.reroute_at <= now()
        AND c.status = 'open'
        AND c.responded_at IS NULL
        AND c.reassigned_at IS NULL
      ORDER BY e.reroute_at, e.check_id
      FOR UPDATE OF e, c SKIP LOCKED
      LIMIT 1
    `);
    if (!selected.rowCount) return null;

    const row = selected.rows[0];
    if (!row.fallback_reviewer_id) {
      await client.query(`
        UPDATE check_escalations
        SET cancelled_at = now(), last_error = 'Keine Ausweichperson mehr hinterlegt', updated_at = now()
        WHERE check_id = $1
      `, [row.check_id]);
      await addActivity(client, {
        userId: row.requester_id,
        actorUserId: null,
        checkId: row.check_id,
        title: 'Automatische Weitergabe gestoppt',
        body: 'Es ist keine Ausweichperson mehr hinterlegt.',
        dedupeKey: `check:${row.check_id}:auto-reroute-stopped`
      });
      return { checkId: row.check_id, cancelled: true };
    }

    const connection = await activeConnection(client, row.requester_id, row.fallback_reviewer_id);
    if (!connection) {
      await client.query(`
        UPDATE check_escalations
        SET cancelled_at = now(), last_error = 'Ausweichverbindung ist nicht mehr aktiv', updated_at = now()
        WHERE check_id = $1
      `, [row.check_id]);
      await addActivity(client, {
        userId: row.requester_id,
        actorUserId: null,
        checkId: row.check_id,
        title: 'Automatische Weitergabe gestoppt',
        body: 'Die Verbindung zur Ausweichperson ist nicht mehr aktiv.',
        dedupeKey: `check:${row.check_id}:auto-reroute-stopped`
      });
      return { checkId: row.check_id, cancelled: true };
    }

    const assignment = await client.query(`
      INSERT INTO check_reassignments (check_id, from_reviewer_id, to_reviewer_id, changed_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
    `, [row.check_id, row.reviewer_id, row.fallback_reviewer_id, row.requester_id]);

    const changed = await client.query(`
      UPDATE check_requests
      SET reviewer_id = $2,
          fallback_reviewer_id = NULL,
          reassigned_at = now(),
          updated_at = now()
      WHERE id = $1 AND status = 'open' AND reassigned_at IS NULL
      RETURNING reviewer_id, reassigned_at
    `, [row.check_id, row.fallback_reviewer_id]);
    if (!changed.rowCount) return null;

    await client.query(`
      UPDATE check_escalations
      SET rerouted_at = now(), cancelled_at = NULL, last_error = NULL, updated_at = now()
      WHERE check_id = $1
    `, [row.check_id]);

    await addActivity(client, {
      userId: row.fallback_reviewer_id,
      eventType: 'check_created',
      actorUserId: row.requester_id,
      checkId: row.check_id,
      title: 'Prüfanfrage automatisch weitergegeben',
      body: `${row.requester_name || 'Eine Vertrauensperson'} hat die Eskalationsautomatik genutzt und die offene Prüfanfrage an dich weitergegeben.`,
      dedupeKey: `check:${row.check_id}:auto-rerouted:${assignment.rows[0].id}`
    });
    await addActivity(client, {
      userId: row.requester_id,
      actorUserId: row.fallback_reviewer_id,
      checkId: row.check_id,
      title: 'Automatisch weitergegeben',
      body: `Die offene Prüfanfrage wurde an ${row.fallback_name || 'deine Ausweichperson'} weitergegeben.`,
      dedupeKey: `check:${row.check_id}:auto-rerouted-requester`
    });

    await client.query(`
      UPDATE push_notifications
      SET status = 'skipped',
          last_error = 'Prüfanfrage wurde automatisch weitergegeben',
          updated_at = now()
      WHERE check_id = $1
        AND event_type IN ('check_created', 'check_reminder')
        AND status IN ('pending', 'failed')
    `, [row.check_id]);

    const emailTable = await client.query("SELECT to_regclass('public.email_notifications') AS table_name");
    if (emailTable.rows[0]?.table_name) {
      await client.query(`
        UPDATE email_notifications
        SET status = 'skipped',
            last_error = 'Prüfanfrage wurde automatisch weitergegeben',
            updated_at = now()
        WHERE check_id = $1
          AND event_type IN ('check_created', 'check_reminder')
          AND status IN ('pending', 'failed')
      `, [row.check_id]);
    }

    return {
      checkId: row.check_id,
      rerouted: true,
      reviewerId: changed.rows[0].reviewer_id,
      reassignedAt: changed.rows[0].reassigned_at
    };
  });
}

async function cancelInactiveEscalations() {
  await db.query(`
    UPDATE check_escalations e
    SET cancelled_at = COALESCE(e.cancelled_at, now()), updated_at = now()
    FROM check_requests c
    WHERE c.id = e.check_id
      AND e.cancelled_at IS NULL
      AND e.rerouted_at IS NULL
      AND (c.status <> 'open' OR c.reassigned_at IS NOT NULL)
  `);
}

async function runEscalationWorkerOnce({ maxJobs = 20 } = {}) {
  if (workerRunning) return { processed: 0, skipped: true };
  workerRunning = true;
  let processed = 0;

  try {
    await ensureEscalationSchema();
    await cancelInactiveEscalations();

    while (processed < maxJobs) {
      const rerouted = await processDueReroute();
      if (rerouted) {
        processed += 1;
        continue;
      }

      const reminded = await processDueReminder();
      if (reminded) {
        processed += 1;
        continue;
      }
      break;
    }

    return { processed, skipped: false };
  } finally {
    workerRunning = false;
  }
}

function startEscalationWorker() {
  if (initialTimer || intervalTimer) return;
  const execute = () => {
    runEscalationWorkerOnce().catch((error) => {
      schemaReady = false;
      console.error('[escalation-worker] Durchlauf fehlgeschlagen:', error.message);
    });
  };

  initialTimer = setTimeout(() => {
    initialTimer = null;
    execute();
  }, 5_000);
  initialTimer.unref?.();

  intervalTimer = setInterval(execute, 10_000);
  intervalTimer.unref?.();
}

module.exports = {
  ALLOWED_REMINDER_MINUTES,
  AUTO_REROUTE_DELAY_MINUTES,
  normalizeReminderMinutes,
  normalizeAutoReroute,
  ensureEscalationSchema,
  createCheckEscalation,
  escalationState,
  serializeEscalation,
  registerEscalationRoutes,
  runEscalationWorkerOnce,
  startEscalationWorker
};
