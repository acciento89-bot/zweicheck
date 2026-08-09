const db = require('./db');

(async () => {
  try {
    await db.waitForDb();
    await db.migrate();
    console.log('[db] Migration abgeschlossen.');
    await db.pool.end();
  } catch (error) {
    console.error('[db] Migration fehlgeschlagen:', error);
    process.exitCode = 1;
  }
})();
