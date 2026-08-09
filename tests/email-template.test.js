const test = require('node:test');
const assert = require('node:assert/strict');

const {
  verificationEmail,
  passwordResetEmail,
  invitationEmail,
  newCheckEmail,
  checkAnsweredEmail,
  fromLegacyEmail
} = require('../server/email-template');

const ACTION_URL = 'https://zweicheck.kamilunavo.com/#verify=test-token';

test('verification email uses ZweiCheck branding, CTA and text fallback', () => {
  const email = verificationEmail({ name: 'Piotr', actionUrl: ACTION_URL });

  assert.equal(email.subject, 'E-Mail für ZweiCheck bestätigen');
  assert.match(email.text, /Hallo Piotr/);
  assert.match(email.text, /24 Stunden/);
  assert.match(email.html, /ZweiCheck/);
  assert.match(email.html, /Gemeinsam prüfen\. Sicher handeln\./);
  assert.match(email.html, /#061a2f/);
  assert.match(email.html, /E-Mail bestätigen/);
  assert.match(email.html, /test-token/);
});

test('all transactional templates contain responsive HTML and plain text', () => {
  const templates = [
    passwordResetEmail({ name: 'Diana', actionUrl: 'https://example.test/#reset=abc' }),
    invitationEmail({ inviterName: 'Piotr', actionUrl: 'https://example.test/#invite=ABC123', code: 'ABC123' }),
    newCheckEmail({ recipientName: 'Diana', requesterName: 'Piotr', category: 'Zahlung oder Rechnung', urgency: 'Dringend', actionUrl: 'https://example.test/#check=123' }),
    checkAnsweredEmail({ recipientName: 'Piotr', reviewerName: 'Diana', recommendation: 'Nicht handeln', actionUrl: 'https://example.test/#check=123' })
  ];

  for (const email of templates) {
    assert.ok(email.subject.length > 5);
    assert.ok(email.text.length > 40);
    assert.match(email.html, /<!doctype html>/i);
    assert.match(email.html, /viewport/);
    assert.match(email.html, /role="presentation"/);
  }
});

test('user supplied names are escaped in HTML', () => {
  const email = verificationEmail({
    name: '<img src=x onerror=alert(1)>',
    actionUrl: ACTION_URL
  });

  assert.doesNotMatch(email.html, /<img src=x/);
  assert.match(email.html, /&lt;img/);
});

test('legacy verification, reset and invitation messages become branded HTML', () => {
  const verification = fromLegacyEmail({
    subject: 'E-Mail für ZweiCheck bestätigen',
    text: `Hallo Piotr,\n\nbestätige deine E-Mail-Adresse über diesen Link:\n${ACTION_URL}\n\nDer Link ist 24 Stunden gültig.`
  });
  assert.match(verification.html, /Konto schützen/);

  const reset = fromLegacyEmail({
    subject: 'ZweiCheck-Passwort zurücksetzen',
    text: 'Hallo Piotr,\n\nsetze dein Passwort über diesen Link zurück:\nhttps://example.test/#reset=abc'
  });
  assert.match(reset.html, /Neues Passwort festlegen/);

  const invite = fromLegacyEmail({
    subject: 'Piotr lädt dich zu ZweiCheck ein',
    text: 'Piotr möchte dich verbinden.\n\nhttps://example.test/#invite=ABC123\n\nOder gib den Code ABC123 in ZweiCheck ein.'
  });
  assert.match(invite.html, /ABC123/);
  assert.match(invite.html, /Einladung annehmen/);
});
