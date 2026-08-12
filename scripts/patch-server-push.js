const fs = require('node:fs');

function replaceRequired(source, oldCode, newCode, label) {
  if (source.includes(newCode)) return source;
  if (!source.includes(oldCode)) throw new Error(`${label} insertion point not found`);
  return source.replace(oldCode, newCode);
}

const indexFile = 'server/index.js';
let source = fs.readFileSync(indexFile, 'utf8');

const importNeedle = "const { deliverEmail } = require('./mailer');";
const pushImport = "const { registerPushRoutes, startPushWorker } = require('./push');";
const activityImport = "const { registerActivityRoutes } = require('./activity');";
const trustImport = "const { registerTrustRoutingRoutes } = require('./trust-routing');";
const trustSchemaImport = "const { ensureTrustRoutingSchema } = require('./trust-routing-schema');";

if (!source.includes("require('./push')")) {
  source = replaceRequired(source, importNeedle, `${importNeedle}\n${pushImport}`, 'Push import');
}
if (!source.includes("require('./activity')")) {
  const anchor = source.includes(pushImport) ? pushImport : importNeedle;
  source = replaceRequired(source, anchor, `${anchor}\n${activityImport}`, 'Activity import');
}
if (!source.includes("require('./trust-routing')")) {
  const anchor = source.includes(activityImport) ? activityImport : (source.includes(pushImport) ? pushImport : importNeedle);
  source = replaceRequired(source, anchor, `${anchor}\n${trustImport}\n${trustSchemaImport}`, 'Trust routing import');
}

const routeNeedle = "  app.post('/api/auth/register', asyncHandler(async (req, res) => {";
if (!source.includes('registerPushRoutes(app')) {
  source = replaceRequired(
    source,
    routeNeedle,
    `  registerPushRoutes(app, { requireAuth, requireVerified, asyncHandler, httpError });\n\n${routeNeedle}`,
    'Push routes'
  );
}
if (!source.includes('registerActivityRoutes(app')) {
  source = replaceRequired(
    source,
    routeNeedle,
    `  registerActivityRoutes(app, { requireAuth, asyncHandler, httpError });\n\n${routeNeedle}`,
    'Activity routes'
  );
}
if (!source.includes('registerTrustRoutingRoutes(app')) {
  source = replaceRequired(
    source,
    routeNeedle,
    `  registerTrustRoutingRoutes(app, { requireAuth, requireVerified, asyncHandler, httpError });\n\n${routeNeedle}`,
    'Trust routing routes'
  );
}

const reviewerBlock = `      const reviewerId = String(req.body.reviewerId || '');
      if (!reviewerId || reviewerId === req.user.id) throw httpError(400, 'Bitte wähle eine Vertrauensperson aus.', 'INVALID_REVIEWER');
      const connection = await activeConnection(req.user.id, reviewerId);
      if (!connection) throw httpError(403, 'Diese Vertrauensverbindung ist nicht aktiv.', 'CONNECTION_REQUIRED');`;
const reviewerBlockWithFallback = `      const reviewerId = String(req.body.reviewerId || '');
      const fallbackReviewerId = String(req.body.fallbackReviewerId || '').trim();
      if (!reviewerId || reviewerId === req.user.id) throw httpError(400, 'Bitte wähle eine Vertrauensperson aus.', 'INVALID_REVIEWER');
      const connection = await activeConnection(req.user.id, reviewerId);
      if (!connection) throw httpError(403, 'Diese Vertrauensverbindung ist nicht aktiv.', 'CONNECTION_REQUIRED');
      if (fallbackReviewerId) {
        if (fallbackReviewerId === req.user.id || fallbackReviewerId === reviewerId) {
          throw httpError(400, 'Bitte wähle eine andere Ausweichperson.', 'INVALID_FALLBACK_REVIEWER');
        }
        const fallbackConnection = await activeConnection(req.user.id, fallbackReviewerId);
        if (!fallbackConnection) {
          throw httpError(403, 'Die Ausweichperson gehört nicht zu deinem aktiven Vertrauenskreis.', 'FALLBACK_CONNECTION_REQUIRED');
        }
      }`;
if (!source.includes('const fallbackReviewerId = String(req.body.fallbackReviewerId')) {
  source = replaceRequired(source, reviewerBlock, reviewerBlockWithFallback, 'Fallback reviewer validation');
}

const insertBlock = `          \`INSERT INTO check_requests
             (id, requester_id, reviewer_id, category, description, amount_cents, urgency)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *\`,
          [checkId, req.user.id, reviewerId, category, description, amountCents, urgency]`;
const insertBlockWithFallback = `          \`INSERT INTO check_requests
             (id, requester_id, reviewer_id, fallback_reviewer_id, category, description, amount_cents, urgency)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING *\`,
          [checkId, req.user.id, reviewerId, fallbackReviewerId || null, category, description, amountCents, urgency]`;
if (!source.includes('(id, requester_id, reviewer_id, fallback_reviewer_id, category')) {
  source = replaceRequired(source, insertBlock, insertBlockWithFallback, 'Fallback reviewer insert');
}

const staticNeedle = "  app.get('/app.js', sendPublic('app.js'));";
const pushClientRoute = "  app.get('/push-client.js', sendPublic('push-client.js'));";
if (!source.includes("app.get('/push-client.js'")) {
  source = replaceRequired(
    source,
    staticNeedle,
    `${staticNeedle}\n  app.get('/deep-link.js', sendPublic('deep-link.js'));\n${pushClientRoute}`,
    'Push static routes'
  );
}
if (!source.includes("app.get('/activity-center.js'")) {
  const anchor = source.includes(pushClientRoute) ? pushClientRoute : staticNeedle;
  source = replaceRequired(
    source,
    anchor,
    `${anchor}\n  app.get('/activity-center.js', sendPublic('activity-center.js'));\n  app.get('/activity-center.css', sendPublic('activity-center.css'));`,
    'Activity static routes'
  );
}
if (!source.includes("app.get('/trust-routing.js'")) {
  const anchor = "  app.get('/activity-center.css', sendPublic('activity-center.css'));";
  source = replaceRequired(
    source,
    anchor,
    `${anchor}\n  app.get('/trust-routing.js', sendPublic('trust-routing.js'));\n  app.get('/trust-routing.css', sendPublic('trust-routing.css'));`,
    'Trust routing static routes'
  );
}

const migrationNeedle = '  await db.migrate();';
if (!source.includes('  await ensureTrustRoutingSchema();')) {
  source = replaceRequired(
    source,
    migrationNeedle,
    `${migrationNeedle}\n  await ensureTrustRoutingSchema();`,
    'Trust routing schema startup'
  );
}
if (!source.includes('  startPushWorker();')) {
  const workerAnchor = source.includes('  await ensureTrustRoutingSchema();')
    ? '  await ensureTrustRoutingSchema();'
    : migrationNeedle;
  source = replaceRequired(source, workerAnchor, `${workerAnchor}\n  startPushWorker();`, 'Push worker startup');
}

fs.writeFileSync(indexFile, source);

const emailFile = 'server/notification-worker.js';
let emailSource = fs.readFileSync(emailFile, 'utf8');
emailSource = replaceRequired(
  emailSource,
  "event_type TEXT NOT NULL CHECK (event_type IN ('check_created', 'check_answered'))",
  "event_type TEXT NOT NULL CHECK (event_type IN ('check_created', 'check_answered', 'check_rerouted'))",
  'Email notification event constraint'
);

const emailConstraintAnchor = '  if (!tableExisted) {';
const emailConstraintPatch = `  await db.query(\`
    ALTER TABLE email_notifications
      DROP CONSTRAINT IF EXISTS email_notifications_event_type_check;
    ALTER TABLE email_notifications
      ADD CONSTRAINT email_notifications_event_type_check
      CHECK (event_type IN ('check_created', 'check_answered', 'check_rerouted'));
  \`);\n\n${emailConstraintAnchor}`;
if (!emailSource.includes("CHECK (event_type IN ('check_created', 'check_answered', 'check_rerouted'));") || !emailSource.includes('DROP CONSTRAINT IF EXISTS email_notifications_event_type_check')) {
  emailSource = replaceRequired(emailSource, emailConstraintAnchor, emailConstraintPatch, 'Email constraint migration');
}

const emailCreatedEnqueue = `    INSERT INTO email_notifications (check_id, event_type)
    SELECT id, 'check_created'
    FROM check_requests
    ON CONFLICT (check_id, event_type) DO NOTHING;`;
const emailCreatedAndRerouted = `    INSERT INTO email_notifications (check_id, event_type)
    SELECT id, 'check_created'
    FROM check_requests
    WHERE reassigned_at IS NULL
    ON CONFLICT (check_id, event_type) DO NOTHING;

    INSERT INTO email_notifications (check_id, event_type)
    SELECT id, 'check_rerouted'
    FROM check_requests
    WHERE reassigned_at IS NOT NULL
    ON CONFLICT (check_id, event_type) DO NOTHING;`;
if (!emailSource.includes("SELECT id, 'check_rerouted'")) {
  emailSource = replaceRequired(emailSource, emailCreatedEnqueue, emailCreatedAndRerouted, 'Email reroute enqueue');
}

const emailAnsweredNeedle = `  if (eventType === 'check_answered') {`;
const emailReroutedCase = `  if (eventType === 'check_rerouted') {
    const content = newCheckEmail({
      recipientName: row.reviewer_name,
      requesterName: row.requester_name,
      category: CATEGORY_LABELS[row.category] || 'Prüfanfrage',
      urgency: URGENCY_LABELS[row.urgency] || 'Nicht angegeben',
      actionUrl
    });
    return { to: row.reviewer_email, ...content, subject: \`Weitergeleitete Prüfanfrage von \${row.requester_name}\` };
  }\n\n${emailAnsweredNeedle}`;
if (!emailSource.includes("eventType === 'check_rerouted'")) {
  emailSource = replaceRequired(emailSource, emailAnsweredNeedle, emailReroutedCase, 'Email reroute message');
}
fs.writeFileSync(emailFile, emailSource);

const pushFile = 'server/push.js';
let pushSource = fs.readFileSync(pushFile, 'utf8');
const pushCreatedCondition = `      AND c.created_at >= state.activated_at`;
if (!pushSource.includes('      AND c.reassigned_at IS NULL')) {
  pushSource = replaceRequired(
    pushSource,
    pushCreatedCondition,
    `${pushCreatedCondition}\n      AND c.reassigned_at IS NULL`,
    'Push created reroute guard'
  );
}

const pushAnsweredInsert = `    INSERT INTO push_notifications (check_id, event_type)
    SELECT c.id, 'check_answered'`;
const pushReroutedInsert = `    INSERT INTO push_notifications (check_id, event_type)
    SELECT c.id, 'check_rerouted'
    FROM check_requests c
    CROSS JOIN push_worker_state state
    WHERE state.id = TRUE
      AND c.reassigned_at IS NOT NULL
      AND c.reassigned_at >= state.activated_at
    ON CONFLICT (check_id, event_type) DO NOTHING;

${pushAnsweredInsert}`;
if (!pushSource.includes("SELECT c.id, 'check_rerouted'")) {
  pushSource = replaceRequired(pushSource, pushAnsweredInsert, pushReroutedInsert, 'Push reroute enqueue');
}

const pushAnsweredNeedle = `  if (eventType === 'check_answered') {`;
const pushReroutedCase = `  if (eventType === 'check_rerouted') {
    return {
      userId: row.reviewer_id,
      payload: {
        title: 'Prüfanfrage weitergegeben',
        body: \`\${row.requester_name} hat eine offene Prüfanfrage an dich weitergegeben.\`,
        url,
        tag: \`zc-rerouted-\${row.id}\`,
        eventType,
        checkId: row.id
      }
    };
  }\n\n${pushAnsweredNeedle}`;
if (!pushSource.includes("eventType === 'check_rerouted'")) {
  pushSource = replaceRequired(pushSource, pushAnsweredNeedle, pushReroutedCase, 'Push reroute payload');
}
fs.writeFileSync(pushFile, pushSource);
