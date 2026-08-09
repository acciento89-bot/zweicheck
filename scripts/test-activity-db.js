const crypto = require('node:crypto');
const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('BEGIN');

  try {
    const requesterId = crypto.randomUUID();
    const reviewerId = crypto.randomUUID();
    const checkId = crypto.randomUUID();
    const invitationId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();
    const suffix = crypto.randomUUID().slice(0, 8);
    const requesterEmail = `requester-${suffix}@example.test`;
    const reviewerEmail = `reviewer-${suffix}@example.test`;

    await client.query(`
      INSERT INTO users (id, email, name, password_hash, email_verified_at)
      VALUES ($1, $2, 'Requester', 'test-hash', now()),
             ($3, $4, 'Reviewer', 'test-hash', now())
    `, [requesterId, requesterEmail, reviewerId, reviewerEmail]);

    await client.query(`
      INSERT INTO check_requests (
        id, requester_id, reviewer_id, category, description, urgency
      ) VALUES ($1, $2, $3, 'payment', 'Sensitive integration-test content', 'high')
    `, [checkId, requesterId, reviewerId]);

    const created = await client.query(`
      SELECT title, body FROM activities
      WHERE user_id = $1 AND check_id = $2 AND event_type = 'check_created'
    `, [reviewerId, checkId]);
    if (created.rowCount !== 1) throw new Error('check_created activity was not generated');
    if (created.rows[0].body.includes('Sensitive integration-test content')) {
      throw new Error('Sensitive check content leaked into activity feed');
    }

    await client.query(`
      UPDATE check_requests
      SET status = 'answered', recommendation = 'do_not_act', responded_at = now(), updated_at = now()
      WHERE id = $1
    `, [checkId]);

    const answered = await client.query(`
      SELECT 1 FROM activities
      WHERE user_id = $1 AND check_id = $2 AND event_type = 'check_answered'
    `, [requesterId, checkId]);
    if (answered.rowCount !== 1) throw new Error('check_answered activity was not generated');

    await client.query(`
      INSERT INTO invitations (id, created_by, invited_email, code_hash, expires_at)
      VALUES ($1, $2, $3, $4, now() + interval '48 hours')
    `, [invitationId, requesterId, reviewerEmail, crypto.createHash('sha256').update(invitationId).digest('hex')]);

    const received = await client.query(`
      SELECT 1 FROM activities
      WHERE user_id = $1 AND invitation_id = $2 AND event_type = 'invitation_received'
    `, [reviewerId, invitationId]);
    if (received.rowCount !== 1) throw new Error('invitation_received activity was not generated');

    await client.query(`
      UPDATE invitations
      SET status = 'accepted', accepted_by = $2, accepted_at = now()
      WHERE id = $1
    `, [invitationId, reviewerId]);

    const accepted = await client.query(`
      SELECT 1 FROM activities
      WHERE user_id = $1 AND invitation_id = $2 AND event_type = 'invitation_accepted'
    `, [requesterId, invitationId]);
    if (accepted.rowCount !== 1) throw new Error('invitation_accepted activity was not generated');

    await client.query(`
      INSERT INTO trust_connections (id, user_a_id, user_b_id, created_by)
      VALUES ($1, $2, $3, $2)
    `, [connectionId, requesterId, reviewerId]);
    await client.query('UPDATE trust_connections SET revoked_at = now() WHERE id = $1', [connectionId]);

    const revoked = await client.query(`
      SELECT user_id FROM activities
      WHERE connection_id = $1 AND event_type = 'connection_revoked'
    `, [connectionId]);
    if (revoked.rowCount !== 2) throw new Error('connection_revoked activities were not generated for both users');

    console.log('activity database integration test passed');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
