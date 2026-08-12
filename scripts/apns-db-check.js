const crypto = require('node:crypto');
const { Client } = require('pg');
const { ensureNativePushSchema } = require('../server/apns');

async function main() {
  await ensureNativePushSchema();
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('BEGIN');
  try {
    const userId = crypto.randomUUID();
    const tokenId = crypto.randomUUID();
    const token = 'ab'.repeat(32);
    const email = `apns-${crypto.randomUUID().slice(0, 8)}@example.test`;

    await client.query(`
      INSERT INTO users (id, email, name, password_hash, email_verified_at)
      VALUES ($1, $2, 'APNs Test', 'test-hash', now())
    `, [userId, email]);

    await client.query(`
      INSERT INTO native_push_tokens (id, user_id, token, environment)
      VALUES ($1, $2, $3, 'sandbox')
    `, [tokenId, userId, token]);

    const saved = await client.query(`
      SELECT user_id, token, environment
      FROM native_push_tokens
      WHERE id = $1
    `, [tokenId]);
    if (saved.rowCount !== 1) throw new Error('native push token was not persisted');
    if (saved.rows[0].token !== token || saved.rows[0].environment !== 'sandbox') {
      throw new Error('native push token data mismatch');
    }

    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    const cascaded = await client.query('SELECT 1 FROM native_push_tokens WHERE id = $1', [tokenId]);
    if (cascaded.rowCount !== 0) throw new Error('native push token did not cascade on account deletion');

    console.log('[apns-db-check] Native Push schema OK');
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
