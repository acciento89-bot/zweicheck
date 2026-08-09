const fs = require('node:fs');

const file = 'server/index.js';
let source = fs.readFileSync(file, 'utf8');

const importNeedle = "const { deliverEmail } = require('./mailer');";
const importCode = `${importNeedle}\nconst { registerPushRoutes, startPushWorker } = require('./push');`;

if (!source.includes("require('./push')")) {
  if (!source.includes(importNeedle)) throw new Error('Mailer import not found in server/index.js');
  source = source.replace(importNeedle, importCode);
}

const routeNeedle = "  app.post('/api/auth/register', asyncHandler(async (req, res) => {";
const routeCode = `  registerPushRoutes(app, { requireAuth, requireVerified, asyncHandler, httpError });\n\n${routeNeedle}`;

if (!source.includes('registerPushRoutes(app')) {
  if (!source.includes(routeNeedle)) throw new Error('Auth route insertion point not found in server/index.js');
  source = source.replace(routeNeedle, routeCode);
}

const staticNeedle = "  app.get('/app.js', sendPublic('app.js'));";
const staticCode = `${staticNeedle}\n  app.get('/deep-link.js', sendPublic('deep-link.js'));\n  app.get('/push-client.js', sendPublic('push-client.js'));`;

if (!source.includes("app.get('/push-client.js'")) {
  if (!source.includes(staticNeedle)) throw new Error('Static script insertion point not found in server/index.js');
  source = source.replace(staticNeedle, staticCode);
}

const workerNeedle = '  await db.migrate();';
const workerCode = `${workerNeedle}\n  startPushWorker();`;

if (!source.includes('  startPushWorker();')) {
  if (!source.includes(workerNeedle)) throw new Error('Migration insertion point not found in server/index.js');
  source = source.replace(workerNeedle, workerCode);
}

fs.writeFileSync(file, source);
