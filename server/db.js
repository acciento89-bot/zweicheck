const fs = require('node:fs/promises');
const path = require('node:path');
const { Pool } = require('pg');
const { config } = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 12,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false
});

pool.on('error', (error) => {
  console.error('[db] Unerwarteter Pool-Fehler:', error);
});

async function waitForDb(attempts = 30, delayMs = 2000) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      console.warn(`[db] Verbindung nicht bereit (${attempt}/${attempts})`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = await fs.readFile(schemaPath, 'utf8');
  await pool.query(sql);
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  pool,
  query: (...args) => pool.query(...args),
  waitForDb,
  migrate,
  withTransaction
};
