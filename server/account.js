const fs = require('node:fs/promises');
const path = require('node:path');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');

const db = require('./db');
const { config } = require('./config');

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function tableExists(client, tableName) {
  const result = await client.query('SELECT to_regclass($1) AS table_name', [`public.${tableName}`]);
  return Boolean(result.rows[0]?.table_name);
}

function exportCheck(row) {
  return {
    id: row.id,
    role: row.requester_id === row.export_user_id ? 'angefragt' : 'geprüft',
    requester: { name: row.requester_name, email: row.requester_email },
    reviewer: { name: row.reviewer_name, email: row.reviewer_email },
    fallbackReviewer: row.fallback_name ? { name: row.fallback_name, email: row.fallback_email } : null,
    category: row.category,
    description: row.description,
    amountCents: row.amount_cents === null ? null : Number(row.amount_cents),
    urgency: row.urgency,
    status: row.status,
    recommendation: row.recommendation,
    responseNote: row.response_note,
    respondedAt: iso(row.responded_at),
    closedAt: iso(row.closed_at),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at)
  };
}

async function buildAccountExport(userId, client = db) {
  const userResult = await client.query(
    `SELECT id, email, name, email_verified_at, created_at, updated_at
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!userResult.rowCount) return null;
  const user = userResult.rows[0];

  const [connectionsResult, invitationsResult, checksResult, attachmentsResult, activitiesResult, pushCountResult] = await Promise.all([
    client.query(
      `SELECT tc.id, tc.created_at, tc.revoked_at,
              CASE WHEN tc.user_a_id = $1 THEN b.name ELSE a.name END AS person_name,
              CASE WHEN tc.user_a_id = $1 THEN b.email ELSE a.email END AS person_email
       FROM trust_connections tc
       JOIN users a ON a.id = tc.user_a_id
       JOIN users b ON b.id = tc.user_b_id
       WHERE tc.user_a_id = $1 OR tc.user_b_id = $1
       ORDER BY tc.created_at`,
      [userId]
    ),
    client.query(
      `SELECT i.id, i.invited_email, i.status, i.expires_at, i.accepted_at, i.created_at,
              creator.name AS creator_name, creator.email AS creator_email,
              accepted.name AS accepted_name, accepted.email AS accepted_email,
              CASE WHEN i.created_by = $1 THEN 'erstellt'
                   WHEN i.accepted_by = $1 OR i.invited_email = $2 THEN 'erhalten'
                   ELSE 'beteiligt' END AS relation
       FROM invitations i
       JOIN users creator ON creator.id = i.created_by
       LEFT JOIN users accepted ON accepted.id = i.accepted_by
       WHERE i.created_by = $1 OR i.accepted_by = $1 OR i.invited_email = $2
       ORDER BY i.created_at`,
      [userId, user.email]
    ),
    client.query(
      `SELECT c.*, $1::uuid AS export_user_id,
              requester.name AS requester_name, requester.email AS requester_email,
              reviewer.name AS reviewer_name, reviewer.email AS reviewer_email,
              fallback.name AS fallback_name, fallback.email AS fallback_email
       FROM check_requests c
       JOIN users requester ON requester.id = c.requester_id
       JOIN users reviewer ON reviewer.id = c.reviewer_id
       LEFT JOIN users fallback ON fallback.id = c.fallback_reviewer_id
       WHERE c.requester_id = $1 OR c.reviewer_id = $1
       ORDER BY c.created_at`,
      [userId]
    ),
    client.query(
      `SELECT a.id, a.check_id, a.original_name, a.mime_type, a.size_bytes, a.created_at
       FROM attachments a
       JOIN check_requests c ON c.id = a.check_id
       WHERE c.requester_id = $1 OR c.reviewer_id = $1
       ORDER BY a.created_at`,
      [userId]
    ),
    client.query(
      `SELECT id, event_type, title, body, read_at, archived_at, created_at
       FROM activities
       WHERE user_id = $1
       ORDER BY id`,
      [userId]
    ),
    client.query('SELECT COUNT(*)::int AS count FROM push_subscriptions WHERE user_id = $1', [userId])
  ]);

  let presence = null;
  if (await tableExists(client, 'user_presence')) {
    const presenceResult = await client.query(
      'SELECT status, expires_at, updated_at FROM user_presence WHERE user_id = $1',
      [userId]
    );
    if (presenceResult.rowCount) {
      presence = {
        status: presenceResult.rows[0].status,
        expiresAt: iso(presenceResult.rows[0].expires_at),
        updatedAt: iso(presenceResult.rows[0].updated_at)
      };
    }
  }

  let routingHistory = [];
  if (await tableExists(client, 'check_reassignments')) {
    const routingResult = await client.query(
      `SELECT r.id, r.check_id, r.created_at,
              from_user.name AS from_name, to_user.name AS to_name, changed.name AS changed_by_name
       FROM check_reassignments r
       JOIN users from_user ON from_user.id = r.from_reviewer_id
       JOIN users to_user ON to_user.id = r.to_reviewer_id
       JOIN users changed ON changed.id = r.changed_by
       JOIN check_requests c ON c.id = r.check_id
       WHERE c.requester_id = $1 OR c.reviewer_id = $1
          OR r.from_reviewer_id = $1 OR r.to_reviewer_id = $1 OR r.changed_by = $1
       ORDER BY r.created_at`,
      [userId]
    );
    routingHistory = routingResult.rows.map((row) => ({
      id: String(row.id),
      checkId: row.check_id,
      from: row.from_name,
      to: row.to_name,
      changedBy: row.changed_by_name,
      createdAt: iso(row.created_at)
    }));
  }

  let reminders = [];
  if (await tableExists(client, 'check_escalations')) {
    const reminderResult = await client.query(
      `SELECT e.*
       FROM check_escalations e
       JOIN check_requests c ON c.id = e.check_id
       WHERE c.requester_id = $1 OR c.reviewer_id = $1
       ORDER BY e.created_at`,
      [userId]
    );
    reminders = reminderResult.rows.map((row) => ({
      checkId: row.check_id,
      reminderMinutes: row.reminder_minutes,
      reminderAt: iso(row.reminder_at),
      remindedAt: iso(row.reminded_at),
      secondPersonEnabled: Boolean(row.auto_reroute),
      secondPersonAt: iso(row.reroute_at),
      forwardedAt: iso(row.rerouted_at),
      stoppedAt: iso(row.cancelled_at),
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at)
    }));
  }

  return {
    exportVersion: 1,
    generatedAt: new Date().toISOString(),
    note: 'Passwörter, Sitzungsschlüssel, Push-Schlüssel und interne Sicherheitstoken sind aus Sicherheitsgründen nicht enthalten. Hochgeladene Bilder sind in dieser JSON-Datei nur als Dateiinformationen aufgeführt.',
    account: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.email_verified_at),
      emailVerifiedAt: iso(user.email_verified_at),
      createdAt: iso(user.created_at),
      updatedAt: iso(user.updated_at),
      registeredPushDevices: pushCountResult.rows[0]?.count || 0,
      helpStatus: presence
    },
    trustedPeople: connectionsResult.rows.map((row) => ({
      id: row.id,
      name: row.person_name,
      email: row.person_email,
      connectedAt: iso(row.created_at),
      endedAt: iso(row.revoked_at)
    })),
    invitations: invitationsResult.rows.map((row) => ({
      id: row.id,
      relation: row.relation,
      invitedEmail: row.invited_email,
      status: row.status,
      creator: { name: row.creator_name, email: row.creator_email },
      acceptedBy: row.accepted_name ? { name: row.accepted_name, email: row.accepted_email } : null,
      expiresAt: iso(row.expires_at),
      acceptedAt: iso(row.accepted_at),
      createdAt: iso(row.created_at)
    })),
    checks: checksResult.rows.map(exportCheck),
    attachments: attachmentsResult.rows.map((row) => ({
      id: row.id,
      checkId: row.check_id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      createdAt: iso(row.created_at)
    })),
    activities: activitiesResult.rows.map((row) => ({
      id: String(row.id),
      type: row.event_type,
      title: row.title,
      text: row.body,
      readAt: iso(row.read_at),
      hiddenAt: iso(row.archived_at),
      createdAt: iso(row.created_at)
    })),
    routingHistory,
    reminders
  };
}

function genericActivityBody(eventType) {
  switch (eventType) {
    case 'check_created': return 'Eine frühere Vertrauensperson hat dich um einen zweiten Blick gebeten.';
    case 'check_answered': return 'Eine frühere Vertrauensperson hat eine Rückmeldung gegeben.';
    case 'check_closed': return 'Eine frühere Vertrauensperson hat einen Vorgang abgeschlossen.';
    case 'invitation_received': return 'Eine frühere Vertrauensperson wollte sich mit dir verbinden.';
    case 'invitation_accepted': return 'Eine frühere Vertrauensperson hat eine Einladung angenommen.';
    case 'invitation_declined': return 'Eine frühere Vertrauensperson hat eine Einladung abgelehnt.';
    default: return 'Eine frühere Vertrauensperson hat diese Aktivität ausgelöst.';
  }
}

async function deleteAccountData(userId, password, httpError) {
  const cleanPassword = String(password || '');
  if (!cleanPassword) throw httpError(400, 'Bitte gib dein Passwort ein.', 'PASSWORD_REQUIRED');

  const deletion = await db.withTransaction(async (client) => {
    const userResult = await client.query(
      'SELECT id, email, name, password_hash FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    if (!userResult.rowCount) throw httpError(404, 'Konto nicht gefunden.', 'ACCOUNT_NOT_FOUND');
    const user = userResult.rows[0];
    const valid = await bcrypt.compare(cleanPassword, user.password_hash);
    if (!valid) throw httpError(401, 'Das Passwort ist nicht richtig.', 'INVALID_PASSWORD');

    const attachmentResult = await client.query(
      `SELECT DISTINCT a.stored_name
       FROM attachments a
       JOIN check_requests c ON c.id = a.check_id
       WHERE c.requester_id = $1 OR c.reviewer_id = $1`,
      [userId]
    );

    await client.query(
      `UPDATE activities
       SET actor_user_id = NULL,
           body = CASE event_type
             WHEN 'check_created' THEN 'Eine frühere Vertrauensperson hat dich um einen zweiten Blick gebeten.'
             WHEN 'check_answered' THEN 'Eine frühere Vertrauensperson hat eine Rückmeldung gegeben.'
             WHEN 'check_closed' THEN 'Eine frühere Vertrauensperson hat einen Vorgang abgeschlossen.'
             WHEN 'invitation_received' THEN 'Eine frühere Vertrauensperson wollte sich mit dir verbinden.'
             WHEN 'invitation_accepted' THEN 'Eine frühere Vertrauensperson hat eine Einladung angenommen.'
             WHEN 'invitation_declined' THEN 'Eine frühere Vertrauensperson hat eine Einladung abgelehnt.'
             ELSE 'Eine frühere Vertrauensperson hat diese Aktivität ausgelöst.'
           END
       WHERE actor_user_id = $1`,
      [userId]
    );

    await client.query(
      `UPDATE invitations
       SET invited_email = NULL,
           status = CASE WHEN status = 'pending' THEN 'revoked' ELSE status END
       WHERE invited_email = $1`,
      [user.email]
    );

    if (await tableExists(client, 'check_reassignments')) {
      await client.query(
        `DELETE FROM check_reassignments
         WHERE from_reviewer_id = $1 OR to_reviewer_id = $1 OR changed_by = $1`,
        [userId]
      );
    }

    await client.query(
      'DELETE FROM check_requests WHERE requester_id = $1 OR reviewer_id = $1',
      [userId]
    );

    await client.query(
      `UPDATE trust_connections
       SET revoked_at = COALESCE(revoked_at, now())
       WHERE user_a_id = $1 OR user_b_id = $1`,
      [userId]
    );
    await client.query(
      `DELETE FROM trust_connections
       WHERE user_a_id = $1 OR user_b_id = $1 OR created_by = $1`,
      [userId]
    );

    await client.query('DELETE FROM users WHERE id = $1', [userId]);

    return {
      email: user.email,
      name: user.name,
      storedNames: attachmentResult.rows.map((row) => row.stored_name)
    };
  });

  await Promise.all(deletion.storedNames.map((storedName) => {
    const safeName = path.basename(storedName);
    return fs.unlink(path.join(config.uploadDir, safeName)).catch((error) => {
      if (error.code !== 'ENOENT') console.warn('[account] Upload konnte nach Kontolöschung nicht entfernt werden:', safeName, error.message);
    });
  }));

  return { deleted: true, email: deletion.email, name: deletion.name };
}

function registerAccountRoutes(app, { requireAuth, asyncHandler, httpError }) {
  const deleteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.' }
  });

  app.get('/api/account/export', requireAuth, asyncHandler(async (req, res) => {
    const data = await buildAccountExport(req.user.id);
    if (!data) throw httpError(404, 'Konto nicht gefunden.', 'ACCOUNT_NOT_FOUND');
    const date = new Date().toISOString().slice(0, 10);
    res.set('Cache-Control', 'no-store');
    res.set('Content-Disposition', `attachment; filename="zweicheck-meine-daten-${date}.json"`);
    res.type('application/json').send(`${JSON.stringify(data, null, 2)}\n`);
  }));

  app.delete('/api/account', deleteLimiter, requireAuth, asyncHandler(async (req, res) => {
    await deleteAccountData(req.user.id, req.body.password, httpError);
    res.clearCookie(config.cookieName, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      path: '/'
    });
    res.json({ deleted: true });
  }));
}

module.exports = {
  registerAccountRoutes,
  buildAccountExport,
  deleteAccountData,
  genericActivityBody
};
