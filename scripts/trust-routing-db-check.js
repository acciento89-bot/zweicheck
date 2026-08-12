const crypto = require('node:crypto');
const { Client } = require('pg');
const { ensureTrustRoutingSchema } = require('../server/trust-routing-schema');

async function main() {
  await ensureTrustRoutingSchema();

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('BEGIN');

  try {
    const requesterId = crypto.randomUUID();
    const primaryId = crypto.randomUUID();
    const fallbackId = crypto.randomUUID();
    const checkId = crypto.randomUUID();
    const connectionA = crypto.randomUUID();
    const connectionB = crypto.randomUUID();
    const suffix = crypto.randomUUID().slice(0, 8);

    await client.query(`
      INSERT INTO users (id, email, name, password_hash, email_verified_at)
      VALUES ($1, $2, 'Requester', 'hash', now()),
             ($3, $4, 'Primary', 'hash', now()),
             ($5, $6, 'Fallback', 'hash', now())
    `, [
      requesterId, `requester-${suffix}@example.test`,
      primaryId, `primary-${suffix}@example.test`,
      fallbackId, `fallback-${suffix}@example.test`
    ]);

    await client.query(`
      INSERT INTO trust_connections (id, user_a_id, user_b_id, created_by)
      VALUES ($1, $2, $3, $2), ($4, $2, $5, $2)
    `, [connectionA, requesterId, primaryId, connectionB, fallbackId]);

    await client.query(`
      INSERT INTO user_presence (user_id, status, expires_at)
      VALUES ($1, 'available', now() + interval '4 hours'),
             ($2, 'urgent_only', now() + interval '1 hour')
    `, [primaryId, fallbackId]);

    const presence = await client.query(
      'SELECT status FROM user_presence WHERE user_id IN ($1, $2) ORDER BY status',
      [primaryId, fallbackId]
    );
    if (presence.rowCount !== 2) throw new Error('presence rows were not stored');

    await client.query(`
      INSERT INTO check_requests (
        id, requester_id, reviewer_id, fallback_reviewer_id, category, description, urgency
      ) VALUES ($1, $2, $3, $4, 'payment', 'Integration test', 'high')
    `, [checkId, requesterId, primaryId, fallbackId]);

    const assignment = await client.query(`
      INSERT INTO check_reassignments (check_id, from_reviewer_id, to_reviewer_id, changed_by)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `, [checkId, primaryId, fallbackId, requesterId]);

    await client.query(`
      UPDATE check_requests
      SET reviewer_id = $2, fallback_reviewer_id = NULL, reassigned_at = now()
      WHERE id = $1
    `, [checkId, fallbackId]);

    await client.query(`
      INSERT INTO push_notifications (check_id, event_type)
      VALUES ($1, 'check_rerouted')
      ON CONFLICT (check_id, event_type) DO NOTHING
    `, [checkId]);

    await client.query(
      `SELECT zc_add_activity($1, 'check_created', $2, $3, NULL, NULL, $4, $5, $6)`,
      [
        fallbackId,
        requesterId,
        checkId,
        'Prüfanfrage weitergegeben',
        'Eine offene Prüfanfrage wurde an dich weitergegeben.',
        `db-check:${checkId}:${assignment.rows[0].id}`
      ]
    );

    const verified = await client.query(`
      SELECT c.reviewer_id, c.reassigned_at,
             (SELECT COUNT(*)::int FROM check_reassignments r WHERE r.check_id = c.id) AS history_count,
             (SELECT COUNT(*)::int FROM push_notifications p WHERE p.check_id = c.id AND p.event_type = 'check_rerouted') AS push_count,
             (SELECT COUNT(*)::int FROM activities a WHERE a.check_id = c.id AND a.title = 'Prüfanfrage weitergegeben') AS activity_count
      FROM check_requests c
      WHERE c.id = $1
    `, [checkId]);

    const row = verified.rows[0];
    if (row.reviewer_id !== fallbackId) throw new Error('reviewer was not rerouted');
    if (!row.reassigned_at) throw new Error('reassigned_at was not written');
    if (row.history_count !== 1) throw new Error('routing history missing');
    if (row.push_count !== 1) throw new Error('reroute push event is not allowed');
    if (row.activity_count < 1) throw new Error('reroute activity missing');

    console.log('trust routing database integration test passed');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
