const test = require('node:test');
const assert = require('node:assert/strict');

process.env.APP_BASE_URL = 'https://zweicheck.kamilunavo.com';

const {
  buildNotificationMessage,
  CATEGORY_LABELS,
  URGENCY_LABELS,
  RECOMMENDATION_LABELS
} = require('../server/notification-worker');

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  category: 'payment',
  urgency: 'high',
  recommendation: 'do_not_act',
  requester_name: 'Piotr',
  requester_email: 'piotr@example.test',
  reviewer_name: 'Diana',
  reviewer_email: 'diana@example.test'
};

test('new check notification is addressed to the reviewer', () => {
  const message = buildNotificationMessage('check_created', row);

  assert.equal(message.to, row.reviewer_email);
  assert.match(message.subject, /Neue Prüfanfrage von Piotr/);
  assert.match(message.text, new RegExp(CATEGORY_LABELS.payment));
  assert.match(message.text, new RegExp(URGENCY_LABELS.high));
  assert.match(message.text, /#check=11111111/);
  assert.match(message.html, /Prüfanfrage öffnen/);
});

test('answered check notification is addressed to the requester', () => {
  const message = buildNotificationMessage('check_answered', row);

  assert.equal(message.to, row.requester_email);
  assert.match(message.subject, /beantwortet/);
  assert.match(message.text, new RegExp(RECOMMENDATION_LABELS.do_not_act));
  assert.match(message.html, /Rückmeldung öffnen/);
});

test('unknown notification type is rejected', () => {
  assert.throws(() => buildNotificationMessage('unknown', row), /Unbekannter Benachrichtigungstyp/);
});
