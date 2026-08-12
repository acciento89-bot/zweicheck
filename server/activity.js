const path = require('node:path');
const db = require('./db');
const { registerAccountRoutes } = require('./account');

const EVENT_ICONS = {
  check_created: '✓',
  check_answered: '↩',
  check_closed: '●',
  invitation_received: '＋',
  invitation_accepted: '◎',
  invitation_declined: '–',
  connection_revoked: '×'
};

function clampLimit(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return 25;
  return Math.max(1, Math.min(parsed, 50));
}

function parseBefore(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeFilter(value) {
  return value === 'unread' ? 'unread' : 'all';
}

function serializeActivity(row) {
  return {
    id: String(row.id),
    eventType: row.event_type,
    icon: EVENT_ICONS[row.event_type] || '•',
    title: row.title,
    body: row.body,
    actorName: row.actor_name || null,
    checkId: row.check_id || null,
    invitationId: row.invitation_id || null,
    connectionId: row.connection_id || null,
    readAt: row.read_at || null,
    createdAt: row.created_at
  };
}

function registerActivityRoutes(app, dependencies) {
  const { requireAuth, asyncHandler, httpError } = dependencies;
  const publicRoot = process.cwd();
  const sendAccountAsset = (fileName, type) => (_req, res) => {
    res.set('Cache-Control', 'public, max-age=3600');
    if (type) res.type(type);
    res.sendFile(path.join(publicRoot, fileName));
  };
  const sendPublicPage = (fileName) => (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.type('html');
    res.sendFile(path.join(publicRoot, fileName));
  };

  app.get('/account-client.js', sendAccountAsset('account-client.js', 'application/javascript'));
  app.get('/account.css', sendAccountAsset('account.css', 'text/css'));
  app.get(['/privacy', '/privacy.html'], sendPublicPage('privacy.html'));
  app.get(['/privacy-choices', '/privacy-choices.html'], sendPublicPage('privacy-choices.html'));
  app.get(['/support', '/support.html'], sendPublicPage('support.html'));
  registerAccountRoutes(app, dependencies);

  app.get('/api/activities', requireAuth, asyncHandler(async (req, res) => {
    const filter = normalizeFilter(req.query.filter);
    const before = parseBefore(req.query.before);
    const limit = clampLimit(req.query.limit);
    const params = [req.user.id, filter, before, limit + 1];

    const result = await db.query(`
      SELECT a.*, actor.name AS actor_name
      FROM activities a
      LEFT JOIN users actor ON actor.id = a.actor_user_id
      WHERE a.user_id = $1
        AND a.archived_at IS NULL
        AND ($2::text <> 'unread' OR a.read_at IS NULL)
        AND ($3::bigint IS NULL OR a.id < $3)
      ORDER BY a.id DESC
      LIMIT $4
    `, params);

    const rows = result.rows.slice(0, limit);
    const unread = await db.query(`
      SELECT COUNT(*)::integer AS count
      FROM activities
      WHERE user_id = $1 AND archived_at IS NULL AND read_at IS NULL
    `, [req.user.id]);

    res.json({
      activities: rows.map(serializeActivity),
      unreadCount: unread.rows[0]?.count || 0,
      nextBefore: result.rows.length > limit ? String(rows.at(-1).id) : null
    });
  }));

  app.get('/api/activities/unread-count', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(`
      SELECT COUNT(*)::integer AS count
      FROM activities
      WHERE user_id = $1 AND archived_at IS NULL AND read_at IS NULL
    `, [req.user.id]);
    res.json({ unreadCount: result.rows[0]?.count || 0 });
  }));

  app.patch('/api/activities/:id/read', requireAuth, asyncHandler(async (req, res) => {
    const id = parseBefore(req.params.id);
    if (!id) throw httpError(400, 'Ungültige Benachrichtigung.', 'INVALID_ACTIVITY');

    const result = await db.query(`
      UPDATE activities
      SET read_at = COALESCE(read_at, now())
      WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
      RETURNING *
    `, [id, req.user.id]);
    if (!result.rowCount) throw httpError(404, 'Benachrichtigung nicht gefunden.', 'NOT_FOUND');
    res.json({ activity: serializeActivity(result.rows[0]) });
  }));

  app.post('/api/activities/read-all', requireAuth, asyncHandler(async (req, res) => {
    const result = await db.query(`
      UPDATE activities
      SET read_at = now()
      WHERE user_id = $1 AND archived_at IS NULL AND read_at IS NULL
    `, [req.user.id]);
    res.json({ changed: result.rowCount });
  }));

  app.delete('/api/activities/:id', requireAuth, asyncHandler(async (req, res) => {
    const id = parseBefore(req.params.id);
    if (!id) throw httpError(400, 'Ungültige Benachrichtigung.', 'INVALID_ACTIVITY');

    const result = await db.query(`
      UPDATE activities
      SET archived_at = now(), read_at = COALESCE(read_at, now())
      WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
      RETURNING id
    `, [id, req.user.id]);
    if (!result.rowCount) throw httpError(404, 'Benachrichtigung nicht gefunden.', 'NOT_FOUND');
    res.status(204).end();
  }));
}

module.exports = {
  EVENT_ICONS,
  clampLimit,
  parseBefore,
  normalizeFilter,
  serializeActivity,
  registerActivityRoutes
};
