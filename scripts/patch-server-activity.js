const fs = require('node:fs');

const file = 'server/index.js';
let source = fs.readFileSync(file, 'utf8');

const importNeedle = "const { deliverEmail } = require('./mailer');";
const importCode = `${importNeedle}\nconst { registerActivityRoutes } = require('./activity');`;

if (!source.includes("require('./activity')")) {
  if (!source.includes(importNeedle)) throw new Error('Mailer import not found in server/index.js');
  source = source.replace(importNeedle, importCode);
}

const routeNeedle = "  app.post('/api/auth/register', asyncHandler(async (req, res) => {";
const routeCode = `  registerActivityRoutes(app, { requireAuth, asyncHandler, httpError });\n\n${routeNeedle}`;

if (!source.includes('registerActivityRoutes(app')) {
  if (!source.includes(routeNeedle)) throw new Error('Auth route insertion point not found in server/index.js');
  source = source.replace(routeNeedle, routeCode);
}

fs.writeFileSync(file, source);
