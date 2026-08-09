const nodemailer = require('nodemailer');
const { config } = require('./config');
const { fromLegacyEmail } = require('./email-template');

let transporter = null;
let notificationWorkerStarted = false;

function getTransporter() {
  if (config.emailMode !== 'smtp') return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000
    });
  }
  return transporter;
}

function resolveContent({ subject, text, html }) {
  if (html) return { subject, text: String(text || ''), html };
  return fromLegacyEmail({ subject, text });
}

async function deliverEmail({ to, subject, text, html }) {
  const content = resolveContent({ subject, text, html });

  if (config.emailMode === 'smtp') {
    const smtp = getTransporter();
    await smtp.sendMail({
      from: config.smtp.from,
      to,
      subject: content.subject,
      text: content.text,
      html: content.html
    });
    return { mode: 'smtp' };
  }

  console.log('\n[email:log]');
  console.log(`An: ${to}`);
  console.log(`Betreff: ${content.subject}`);
  console.log(content.text);
  console.log('[HTML-Version wurde erzeugt]');
  console.log('[/email:log]\n');
  return { mode: 'log' };
}

function startWorkerWhenReady() {
  if (notificationWorkerStarted || config.emailMode !== 'smtp' || process.env.NODE_ENV === 'test') return;
  notificationWorkerStarted = true;
  const { startNotificationWorker } = require('./notification-worker');
  startNotificationWorker({ deliverEmail });
}

module.exports = { deliverEmail, getTransporter, resolveContent, startWorkerWhenReady };

setImmediate(startWorkerWhenReady);
