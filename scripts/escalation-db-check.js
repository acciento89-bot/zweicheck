const crypto = require('node:crypto');
const db = require('../server/db');
const { ensureTrustRoutingSchema } = require('../server/trust-routing-schema');
const {
  ensureEscalationSchema,
  createCheckEscalation,
  runEscalationWorkerOnce
} = require('../server/escalation');

async function main() {
  await ensureTrustRoutingSchema();
  await ensureEscalationSchema();

  const requesterId = crypto.randomUUID();
  const primaryId = crypto.randomUUID();
  const fallbackId = crypto.randomUUID();
  const checkId = crypto.randomUUID();
  const cancelCheckId = crypto.randomUUID();
  const connectionA = crypto.randomUUID();
  const connectionB = crypto.randomUUID();
  const suffix = crypto.randomUUID().slice(0, 8);

  try {
    await db.query(`
      INSERT INTO users (id, email, name, password_hash, email_verified_at)
      VALUES ($1, $2, 'Requester', 'hash', now()),
             ($3, $4, 'Primary', 'hash', now()),
             ($5, $6, 'Fallback', 'hash', now())
    `, [
      requesterId, `escalation-requester-${suffix}@example.test`,
      primaryId, `escalation-primary-${suffix}@example.test`,
      fallbackId, `escalation-fallback-${suffix}@example.test`
    ]);

    await db.query(`
      INSERT INTO trust_connections (id, user_a_id, user_b_id, created_by)
      VALUES ($1, $2, $3, $2), ($4, $2, $5, $2)
    `, [connectionA, requesterId, primaryId, connectionB, fallbackId]);

    await db.query(`
      INSERT INTO check_requests (
        id, requester_id, reviewer_id, fallback_reviewer_id, category, description, urgency
      ) VALUES ($1, $2, $3, $4, 'payment', 'Escalation integration test', 'high')
    `, [checkId, requesterId, primaryId, fallbackId]);

    await createCheckEscalation(db, {
      checkId,
      reminderMinutes: 5,
      autoReroute: true,
      fallbackReviewerId: fallbackId
    });

    await db.query(`
      UPDATE check_escalations
      SET reminder_at = now() - interval '1 minute',
          reroute_at = now() + interval '1 hour'
      WHERE check_id = $1
    `, [checkId]);

    const reminderRun = await runEscalationWorkerOnce({ maxJobs: 1 });
    if (reminderRun.processed !== 1) throw new Error('reminder worker did not process the due check');

    const reminded = await db.query(`
      SELECT e.reminded_at,
             (SELECT COUNT(*)::int FROM activities a WHERE a.check_id = e.check_id AND a.event_type = 'check_reminder') AS activity_count
      FROM check_escalations e
      WHERE e.check_id = $1
    `, [checkId]);
    if (!reminded.rows[0]?.reminded_at) throw new Error('reminded_at was not written');
    if (reminded.rows[0].activity_count < 2) throw new Error('reminder activities were not created');

    await db.query(`
      INSERT INTO push_notifications (check_id, event_type)
      VALUES ($1, 'check_reminder')
      ON CONFLICT (check_id, event_type) DO NOTHING
    `, [checkId]);

    await db.query(`
      UPDATE check_escalations
      SET reroute_at = now() - interval '1 minute'
      WHERE check_id = $1
    `, [checkId]);

    const rerouteRun = await runEscalationWorkerOnce({ maxJobs: 1 });
    if (rerouteRun.processed !== 1) throw new Error('auto-reroute worker did not process the due check');

    const rerouted = await db.query(`
      SELECT c.reviewer_id, c.reassigned_at,
             e.rerouted_at, e.cancelled_at,
             (SELECT COUNT(*)::int FROM check_reassignments r WHERE r.check_id = c.id) AS history_count,
             (SELECT COUNT(*)::int FROM activities a WHERE a.check_id = c.id AND a.title = 'Prüfanfrage automatisch weitergegeben') AS target_activity_count,
             (SELECT status FROM push_notifications p WHERE p.check_id = c.id AND p.event_type = 'check_reminder' LIMIT 1) AS reminder_push_status
      FROM check_requests c
      JOIN check_escalations e ON e.check_id = c.id
      WHERE c.id = $1
    `, [checkId]);

    const reroutedRow = rerouted.rows[0];
    if (reroutedRow.reviewer_id !== fallbackId) throw new Error('check was not routed to fallback reviewer');
    if (!reroutedRow.reassigned_at || !reroutedRow.rerouted_at) throw new Error('reroute timestamps are missing');
    if (reroutedRow.cancelled_at) throw new Error('successful auto-reroute must not stay cancelled');
    if (reroutedRow.history_count !== 1) throw new Error('auto-reroute history is missing');
    if (reroutedRow.target_activity_count !== 1) throw new Error('fallback activity is missing');
    if (reroutedRow.reminder_push_status !== 'skipped') throw new Error('stale reminder push was not skipped');

    await db.query(`
      INSERT INTO check_requests (
        id, requester_id, reviewer_id, fallback_reviewer_id, category, description, urgency
      ) VALUES ($1, $2, $3, $4, 'link', 'Cancellation integration test', 'low')
    `, [cancelCheckId, requesterId, primaryId, fallbackId]);
    await createCheckEscalation(db, {
      checkId: cancelCheckId,
      reminderMinutes: 30,
      autoReroute: true,
      fallbackReviewerId: fallbackId
    });
    await db.query(`UPDATE check_requests SET status = 'closed', closed_at = now() WHERE id = $1`, [cancelCheckId]);

    const cancelled = await db.query('SELECT cancelled_at FROM check_escalations WHERE check_id = $1', [cancelCheckId]);
    if (!cancelled.rows[0]?.cancelled_at) throw new Error('closing a check did not cancel escalation');

    console.log('escalation database integration test passed');
  } finally {
    await db.query('DELETE FROM check_requests WHERE id = ANY($1::uuid[])', [[checkId, cancelCheckId]]).catch(() => {});
    await db.query('DELETE FROM trust_connections WHERE id = ANY($1::uuid[])', [[connectionA, connectionB]]).catch(() => {});
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[requesterId, primaryId, fallbackId]]).catch(() => {});
    await db.close?.().catch?.(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
