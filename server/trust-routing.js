const db = require('./db');

const PRESENCE_STATUSES = new Set(['available', 'urgent_only', 'unavailable']);
const ALLOWED_DURATIONS = new Set([60, 240, 480, 720, 1440]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normalizePresenceStatus(value) {
  const status = String(value || '').trim();
  return PRESENCE_STATUSES.has(status) ? status : 'neutral';
}

function normalizeDurationMinutes(value) {
  if (value === null || value === undefined || value === '' || Number(value) === 0) return null;
  const parsed = Number.parseInt(String(value), 10);
  return ALLOWED_DURATIONS.has(parsed) ? parsed : null;
}

function normalizeUserId(value) {
  const id = String(value || '').trim();
  return UUID_RE.test(id) ? id : null;
}

function effectivePresence(row, now = new Date()) {
  if (!row || !PRESENCE_STATUSES.has(row.status)) {
    return { status: 'neutral', expiresAt: null, updatedAt: row?.updated_at || null };
  }
  if (row.expires_at && new Date(row.expires_at).getTime() <= now.getTime()) {
    return { status: 'neutral', expiresAt: null, updatedAt: row.updated_at || null };
  }
  return {
    status: row.status,
    expiresAt: row.expires_at || null,
    updatedAt: row.updated_at || null
  };
}

async function activeConnection(client, firstId, secondId) {
  const result = await client.query(
    `SELECT id
     FROM trust_connections
     WHERE revoked_at IS NULL
       AND ((user_a_id = $1 AND user_b_id = $2) OR (user_a_id = $2 AND user_b_id = $1))
     LIMIT 1`,
    [firstId, secondId]
  );
  return result.rows[0] || null;
}

async function loadConnections(userId, client = db) {
  const result = await client.query(`
    SELECT tc.id AS connection_id,
           person.id AS person_id,
           person.name AS person_name,
           person.email AS person_email,
           up.status,
           up.expires_at,
           up.updated_at
    FROM trust_connections tc
    JOIN users person
      ON person.id = CASE WHEN tc.user_a_id = $1 THEN tc.user_b_id ELSE tc.user_a_id END
    LEFT JOIN user_presence up ON up.user_id = person.id
    WHERE tc.revoked_at IS NULL
      AND (tc.user_a_id = $1 OR tc.user_b_id = $1)
    ORDER BY lower(person.name), person.id
  `, [userId]);

  return result.rows.map((row) => ({
    connectionId: row.connection_id,
    person: {
      id: row.person_id,
      name: row.person_name,
      email: row.person_email
    },
    presence: effectivePresence(row)
  }));
}

async function loadSelfPresence(userId) {
  const result = await db.query(
    'SELECT status, expires_at, updated_at FROM user_presence WHERE user_id = $1',
    [userId]
  );
  return effectivePresence(result.rows[0]);
}

function registerTrustRoutingRoutes(app, { requireAuth, requireVerified, asyncHandler, httpError }) {
  app.get('/api/trust-routing', requireAuth, asyncHandler(async (req, res) => {
    const [self, connections] = await Promise.all([
      loadSelfPresence(req.user.id),
      loadConnections(req.user.id)
    ]);
    res.json({ self, connections });
  }));

  app.put('/api/trust-routing/presence', requireAuth, requireVerified, asyncHandler(async (req, res) => {
    const status = normalizePresenceStatus(req.body?.status);
    const durationMinutes = normalizeDurationMinutes(req.body?.durationMinutes);

    if (status === 'neutral') {
      await db.query('DELETE FROM user_presence WHERE user_id = $1', [req.user.id]);
      return res.json({ presence: { status: 'neutral', expiresAt: null, updatedAt: new Date().toISOString() } });
    }

    const expiresAt = durationMinutes
      ? new Date(Date.now() + durationMinutes * 60 * 1000)
      : null;

    const result = await db.query(`
      INSERT INTO user_presence (user_id, status, expires_at, updated_at)
      VALUES ($1, $2, $3, now())
      ON CONFLICT (user_id) DO UPDATE
      SET status = EXCLUDED.status,
          expires_at = EXCLUDED.expires_at,
          updated_at = now()
      RETURNING status, expires_at, updated_at
    `, [req.user.id, status, expiresAt]);

    res.json({ presence: effectivePresence(result.rows[0]) });
  }));

  app.get('/api/checks/:id/routing', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(`
      SELECT c.id, c.requester_id, c.reviewer_id, c.fallback_reviewer_id,
             c.status, c.reassigned_at,
             reviewer.name AS reviewer_name,
             reviewer.email AS reviewer_email,
             reviewer_presence.status AS reviewer_presence_status,
             reviewer_presence.expires_at AS reviewer_presence_expires_at,
             reviewer_presence.updated_at AS reviewer_presence_updated_at,
             fallback.name AS fallback_name,
             fallback.email AS fallback_email,
             fallback_presence.status AS fallback_presence_status,
             fallback_presence.expires_at AS fallback_presence_expires_at,
             fallback_presence.updated_at AS fallback_presence_updated_at
      FROM check_requests c
      JOIN users reviewer ON reviewer.id = c.reviewer_id
      LEFT JOIN users fallback ON fallback.id = c.fallback_reviewer_id
      LEFT JOIN user_presence reviewer_presence ON reviewer_presence.user_id = reviewer.id
      LEFT JOIN user_presence fallback_presence ON fallback_presence.user_id = fallback.id
      WHERE c.id = $1
        AND (c.requester_id = $2 OR c.reviewer_id = $2)
    `, [req.params.id, req.user.id]);

    if (!result.rowCount) throw httpError(404, 'Prüfanfrage nicht gefunden.', 'NOT_FOUND');
    const row = result.rows[0];
    const requester = row.requester_id === req.user.id;

    const targets = requester ? await loadConnections(req.user.id) : [];
    const availableTargets = targets.filter((entry) => entry.person.id !== row.reviewer_id);

    const historyResult = requester
      ? await db.query(`
          SELECT r.id, r.created_at,
                 from_user.id AS from_id, from_user.name AS from_name,
                 to_user.id AS to_id, to_user.name AS to_name
          FROM check_reassignments r
          JOIN users from_user ON from_user.id = r.from_reviewer_id
          JOIN users to_user ON to_user.id = r.to_reviewer_id
          WHERE r.check_id = $1
          ORDER BY r.created_at ASC
        `, [row.id])
      : { rows: [] };

    res.json({
      routing: {
        checkId: row.id,
        role: requester ? 'requester' : 'reviewer',
        status: row.status,
        reassignedAt: row.reassigned_at || null,
        currentReviewer: {
          id: row.reviewer_id,
          name: row.reviewer_name,
          email: row.reviewer_email,
          presence: effectivePresence({
            status: row.reviewer_presence_status,
            expires_at: row.reviewer_presence_expires_at,
            updated_at: row.reviewer_presence_updated_at
          })
        },
        fallbackReviewer: row.fallback_reviewer_id ? {
          id: row.fallback_reviewer_id,
          name: row.fallback_name,
          email: row.fallback_email,
          presence: effectivePresence({
            status: row.fallback_presence_status,
            expires_at: row.fallback_presence_expires_at,
            updated_at: row.fallback_presence_updated_at
          })
        } : null,
        targets: availableTargets,
        canReroute: requester && row.status === 'open' && !row.reassigned_at && availableTargets.length > 0,
        history: historyResult.rows.map((entry) => ({
          id: String(entry.id),
          from: { id: entry.from_id, name: entry.from_name },
          to: { id: entry.to_id, name: entry.to_name },
          createdAt: entry.created_at
        }))
      }
    });
  }));

  app.post('/api/checks/:id/reroute', requireAuth, requireVerified, asyncHandler(async (req, res) => {
    const requestedReviewerId = normalizeUserId(req.body?.reviewerId);

    const changed = await db.withTransaction(async (client) => {
      const locked = await client.query(
        `SELECT id, requester_id, reviewer_id, fallback_reviewer_id, status, reassigned_at
         FROM check_requests
         WHERE id = $1
         FOR UPDATE`,
        [req.params.id]
      );
      if (!locked.rowCount) throw httpError(404, 'Prüfanfrage nicht gefunden.', 'NOT_FOUND');

      const check = locked.rows[0];
      if (check.requester_id !== req.user.id) {
        throw httpError(403, 'Nur die anfragende Person kann weitergeben.', 'REROUTE_FORBIDDEN');
      }
      if (check.status !== 'open') {
        throw httpError(409, 'Nur offene Prüfanfragen können weitergegeben werden.', 'CHECK_NOT_OPEN');
      }
      if (check.reassigned_at) {
        throw httpError(409, 'Diese Prüfanfrage wurde bereits einmal weitergegeben.', 'ALREADY_REROUTED');
      }

      const targetId = requestedReviewerId || check.fallback_reviewer_id;
      if (!targetId) throw httpError(400, 'Bitte wähle eine Ausweichperson aus.', 'REROUTE_TARGET_REQUIRED');
      if (targetId === req.user.id || targetId === check.reviewer_id) {
        throw httpError(400, 'Diese Person kann nicht als Ausweichperson verwendet werden.', 'INVALID_REROUTE_TARGET');
      }

      const connection = await activeConnection(client, req.user.id, targetId);
      if (!connection) {
        throw httpError(403, 'Die Ausweichperson gehört nicht mehr zu deinem aktiven Vertrauenskreis.', 'CONNECTION_REQUIRED');
      }

      const assignment = await client.query(`
        INSERT INTO check_reassignments (check_id, from_reviewer_id, to_reviewer_id, changed_by)
        VALUES ($1, $2, $3, $4)
        RETURNING id, created_at
      `, [check.id, check.reviewer_id, targetId, req.user.id]);

      const updated = await client.query(`
        UPDATE check_requests
        SET reviewer_id = $2,
            fallback_reviewer_id = NULL,
            reassigned_at = now(),
            updated_at = now()
        WHERE id = $1
        RETURNING id, reviewer_id, reassigned_at
      `, [check.id, targetId]);

      const actor = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
      await client.query(
        `SELECT zc_add_activity($1, 'check_created', $2, $3, NULL, NULL, $4, $5, $6)`,
        [
          targetId,
          req.user.id,
          check.id,
          'Prüfanfrage weitergegeben',
          `${actor.rows[0]?.name || 'Eine Vertrauensperson'} hat eine offene Prüfanfrage an dich weitergegeben.`,
          `check:${check.id}:rerouted:${assignment.rows[0].id}`
        ]
      );

      await client.query(`
        UPDATE push_notifications
        SET status = 'skipped',
            last_error = 'Prüfanfrage wurde vor dem Erstversand weitergegeben',
            updated_at = now()
        WHERE check_id = $1
          AND event_type = 'check_created'
          AND status IN ('pending', 'failed')
      `, [check.id]);

      const emailTable = await client.query("SELECT to_regclass('public.email_notifications') AS table_name");
      if (emailTable.rows[0]?.table_name) {
        await client.query(`
          UPDATE email_notifications
          SET status = 'skipped',
              last_error = 'Prüfanfrage wurde vor dem Erstversand weitergegeben',
              updated_at = now()
          WHERE check_id = $1
            AND event_type = 'check_created'
            AND status IN ('pending', 'failed')
        `, [check.id]);
      }

      return {
        assignmentId: String(assignment.rows[0].id),
        reviewerId: updated.rows[0].reviewer_id,
        reassignedAt: updated.rows[0].reassigned_at
      };
    });

    res.json({ rerouted: true, ...changed });
  }));
}

module.exports = {
  PRESENCE_STATUSES,
  normalizePresenceStatus,
  normalizeDurationMinutes,
  normalizeUserId,
  effectivePresence,
  registerTrustRoutingRoutes
};
