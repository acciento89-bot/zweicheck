const nodemailer = require('nodemailer');
const { config } = require('./config');

let transporter = null;

function getTransporter() {
  if (config.emailMode !== 'smtp') return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined
    });
  }
  return transporter;
}

async function deliverEmail({ to, subject, text }) {
  if (config.emailMode === 'smtp') {
    const smtp = getTransporter();
    await smtp.sendMail({ from: config.smtp.from, to, subject, text });
    return { mode: 'smtp' };
  }

  console.log('\n[email:log]');
  console.log(`An: ${to}`);
  console.log(`Betreff: ${subject}`);
  console.log(text);
  console.log('[/email:log]\n');
  return { mode: 'log' };
}

module.exports = { deliverEmail };
