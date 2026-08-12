const fs = require('node:fs');

const file = 'server/index.js';
let source = fs.readFileSync(file, 'utf8');

const importNeedle = "const { deliverEmail } = require('./mailer');";
const pushImport = "const { registerPushRoutes, startPushWorker } = require('./push');";
const activityImport = "const { registerActivityRoutes } = require('./activity');";

if (!source.includes("require('./push')")) {
  if (!source.includes(importNeedle)) throw new Error('Mailer import not found in server/index.js');
  source = source.replace(importNeedle, `${importNeedle}\n${pushImport}`);
}

if (!source.includes("require('./activity')")) {
  if (source.includes(pushImport)) {
    source = source.replace(pushImport, `${pushImport}\n${activityImport}`);
  } else if (source.includes(importNeedle)) {
    source = source.replace(importNeedle, `${importNeedle}\n${activityImport}`);
  } else {
    throw new Error('Activity import insertion point not found in server/index.js');
  }
}

const routeNeedle = "  app.post('/api/auth/register', asyncHandler(async (req, res) => {";

if (!source.includes('registerPushRoutes(app')) {
  if (!source.includes(routeNeedle)) throw new Error('Auth route insertion point not found in server/index.js');
  source = source.replace(
    routeNeedle,
    `  registerPushRoutes(app, { requireAuth, requireVerified, asyncHandler, httpError });\n\n${routeNeedle}`
  );
}

if (!source.includes('registerActivityRoutes(app')) {
  if (!source.includes(routeNeedle)) throw new Error('Activity route insertion point not found in server/index.js');
  source = source.replace(
    routeNeedle,
    `  registerActivityRoutes(app, { requireAuth, asyncHandler, httpError });\n\n${routeNeedle}`
  );
}

const staticNeedle = "  app.get('/app.js', sendPublic('app.js'));";
const pushClientRoute = "  app.get('/push-client.js', sendPublic('push-client.js'));";

if (!source.includes("app.get('/push-client.js'")) {
  if (!source.includes(staticNeedle)) throw new Error('Static script insertion point not found in server/index.js');
  source = source.replace(
    staticNeedle,
    `${staticNeedle}\n  app.get('/deep-link.js', sendPublic('deep-link.js'));\n${pushClientRoute}`
  );
}

if (!source.includes("app.get('/activity-center.js'")) {
  const activityStaticNeedle = source.includes(pushClientRoute) ? pushClientRoute : staticNeedle;
  if (!source.includes(activityStaticNeedle)) throw new Error('Activity static insertion point not found in server/index.js');
  source = source.replace(
    activityStaticNeedle,
    `${activityStaticNeedle}\n  app.get('/activity-center.js', sendPublic('activity-center.js'));\n  app.get('/activity-center.css', sendPublic('activity-center.css'));`
  );
}

const workerNeedle = '  await db.migrate();';
const workerCode = `${workerNeedle}\n  startPushWorker();`;

if (!source.includes('  startPushWorker();')) {
  if (!source.includes(workerNeedle)) throw new Error('Migration insertion point not found in server/index.js');
  source = source.replace(workerNeedle, workerCode);
}

fs.writeFileSync(file, source);
