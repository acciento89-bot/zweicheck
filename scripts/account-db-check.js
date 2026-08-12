const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const db = require('../server/db');
const { config } = require('../server/config');
const { ensureTrustRoutingSchema } = require('../server/trust-routing-schema');
const { ensureEscalationSchema } = require('../server/escalation');
const { buildAccountExport, deleteAccountData } = require('../server/account');

function httpError(status, message, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function count(sql, params = []) {
  const result = await db.query(sql, params);
  return Number(result.rows[0]?.count || 0);
}

async function main() {
  await db.migrate();
  await ensureTrustRoutingSchema();
  await ensureEscalationSchema();
  await fs.mkdir(config.uploadDir, { recursive: true });

  const targetId = crypto.randomUUID();
  const friendId = crypto.randomUUID();
  const thirdId = crypto.randomUUID();
  const connectionId = crypto.randomUUID();
  const checkId = crypto.randomUUID();
  const historicalCheckId = crypto.randomUUID();
  const attachmentId = crypto.randomUUID();
  const invitationId = crypto.randomUUID();
  const targetEmail = `delete-${targetId}@example.test`;
  const friendEmail = `friend-${friendId}@example.test`;
  const thirdEmail = `third-${thirdId}@example.test`;
  const targetName = 'Zu Löschende Person';
  const password = 'TestPasswort123';
  const passwordHash = await bcrypt.hash(password, 4);
  const otherHash = await bcrypt.hash('AnderesPasswort123', 4);
  const storedName = `${attachmentId}.png`;
  const storedPath = path.join(config.uploadDir, storedName);

  try {
    await db.query(
      `INSERT INTO users (id, email, name, password_hash, email_verified_at)
       VALUES ($1, $2, $3, $4, now()), ($5, $6, $7, $8, now()), ($9, $10, $11, $8, now())`,
      [
        targetId, targetEmail, targetName, passwordHash,
        friendId, friendEmail, 'Vertrauensperson', otherHash,
        thirdId, thirdEmail, 'Dritte Person'
      ]
    );

    await db.query(
      `INSERT INTO trust_connections (id, user_a_id, user_b_id, created_by)
       VALUES ($1, $2, $3, $2)`,
      [connectionId, targetId, friendId]
    );

    await db.query(
      `INSERT INTO invitations (id, created_by, invited_email, code_hash, expires_at)
       VALUES ($1, $2, $3, $4, now() + interval '2 days')`,
      [invitationId, friendId, targetEmail, crypto.createHash('sha256').update(invitationId).digest('hex')]
    );

    await db.query(
      `INSERT INTO check_requests
         (id, requester_id, reviewer_id, category, description, urgency)
       VALUES ($1, $2, $3, 'message', 'Persönlicher Testinhalt', 'none')`,
      [checkId, targetId, friendId]
    );

    await fs.writeFile(storedPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await db.query(
      `INSERT INTO attachments
         (id, check_id, uploaded_by, original_name, stored_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, 'beweis.png', $4, 'image/png', 4)`,
      [attachmentId, checkId, targetId, storedName]
    );

    await db.query(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent)
       VALUES ($1, $2, $3, 'test-p256dh', 'test-auth', 'CI')`,
      [crypto.randomUUID(), targetId, `https://push.example.test/${targetId}`]
    );

    await db.query(
      `INSERT INTO user_presence (user_id, status, expires_at)
       VALUES ($1, 'available', now() + interval '1 hour')`,
      [targetId]
    );

    await db.query(
      `INSERT INTO check_requests
         (id, requester_id, reviewer_id, category, description, urgency)
       VALUES ($1, $2, $3, 'link', 'Historische Weiterleitung bleibt als Prüfung erhalten', 'low')`,
      [historicalCheckId, friendId, thirdId]
    );
    await db.query(
      `INSERT INTO check_reassignments (check_id, from_reviewer_id, to_reviewer_id, changed_by)
       VALUES ($1, $2, $3, $4)`,
      [historicalCheckId, targetId, thirdId, friendId]
    );

    const exported = await buildAccountExport(targetId);
    assert.equal(exported.account.email, targetEmail);
    assert.equal(exported.account.registeredPushDevices, 1);
    assert.equal(exported.account.helpStatus.status, 'available');
    assert.ok(exported.trustedPeople.some((entry) => entry.email === friendEmail));
    assert.ok(exported.checks.some((entry) => entry.id === checkId));
    assert.ok(exported.attachments.some((entry) => entry.id === attachmentId));
    const serialized = JSON.stringify(exported);
    assert.equal(serialized.includes(passwordHash), false);
    assert.equal(serialized.includes('test-p256dh'), false);
    assert.equal(serialized.includes('test-auth'), false);

    let wrongPasswordError = null;
    try {
      await deleteAccountData(targetId, 'FalschesPasswort123', httpError);
    } catch (error) {
      wrongPasswordError = error;
    }
    assert.equal(wrongPasswordError?.code, 'INVALID_PASSWORD');
    assert.equal(await count('SELECT COUNT(*) FROM users WHERE id = $1', [targetId]), 1);

    const deleted = await deleteAccountData(targetId, password, httpError);
    assert.equal(deleted.deleted, true);

    assert.equal(await count('SELECT COUNT(*) FROM users WHERE id = $1', [targetId]), 0);
    assert.equal(await count('SELECT COUNT(*) FROM check_requests WHERE id = $1', [checkId]), 0);
    assert.equal(await count('SELECT COUNT(*) FROM attachments WHERE id = $1', [attachmentId]), 0);
    assert.equal(await count('SELECT COUNT(*) FROM trust_connections WHERE id = $1', [connectionId]), 0);
    assert.equal(await count('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = $1', [targetId]), 0);
    assert.equal(await count('SELECT COUNT(*) FROM user_presence WHERE user_id = $1', [targetId]), 0);
    assert.equal(await count('SELECT COUNT(*) FROM check_reassignments WHERE from_reviewer_id = $1 OR to_reviewer_id = $1 OR changed_by = $1', [targetId]), 0);
    assert.equal(await count('SELECT COUNT(*) FROM check_requests WHERE id = $1', [historicalCheckId]), 1);

    const invitation = await db.query('SELECT invited_email, status FROM invitations WHERE id = $1', [invitationId]);
    assert.equal(invitation.rows[0].invited_email, null);
    assert.equal(invitation.rows[0].status, 'revoked');

    const foreignActivities = await db.query(
      `SELECT actor_user_id, body
       FROM activities
       WHERE user_id = $1
       ORDER BY id`,
      [friendId]
    );
    assert.ok(foreignActivities.rows.length > 0);
    assert.ok(foreignActivities.rows.every((row) => row.actor_user_id !== targetId));
    assert.ok(foreignActivities.rows.every((row) => !row.body.includes(targetName)));

    let fileGone = false;
    try {
      await fs.access(storedPath);
    } catch (error) {
      fileGone = error.code === 'ENOENT';
    }
    assert.equal(fileGone, true);

    console.log('account export/delete integration ok');
  } finally {
    await fs.unlink(storedPath).catch(() => {});
    await db.query('DELETE FROM check_requests WHERE id = $1', [historicalCheckId]).catch(() => {});
    await db.query('DELETE FROM invitations WHERE id = $1', [invitationId]).catch(() => {});
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[targetId, friendId, thirdId]]).catch(() => {});
    await db.pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
