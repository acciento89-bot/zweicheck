'use strict';

const assert = require('node:assert/strict');

const baseUrl = process.env.APP_BASE_URL || 'http://127.0.0.1:3000';
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const emailA = `mobile-a-${suffix}@example.test`;
const emailB = `mobile-b-${suffix}@example.test`;
const passwordA = 'ZweiCheck12345';
const passwordANew = 'ZweiCheck67890';
const passwordB = 'ZweiCheck54321';

function cookieFrom(response) {
  const raw = response.headers.get('set-cookie') || '';
  const cookie = raw.split(';')[0];
  assert.match(cookie, /^zc_session=/, 'Sitzungscookie fehlt');
  return cookie;
}

function tokenFromDebugUrl(url, key) {
  assert.ok(url, `Debug-URL für ${key} fehlt`);
  const parsed = new URL(url);
  const prefix = `#${key}=`;
  assert.ok(parsed.hash.startsWith(prefix), `Debug-URL enthält #${key}= nicht`);
  return decodeURIComponent(parsed.hash.slice(prefix.length));
}

async function request(path, {
  method = 'GET',
  cookie,
  json,
  body,
  expected = 200
} = {}) {
  const headers = { Accept: 'application/json' };
  if (cookie) headers.Cookie = cookie;
  if (json !== undefined) headers['Content-Type'] = 'application/json';

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: json !== undefined ? JSON.stringify(json) : body
  });

  if (response.status !== expected) {
    const text = await response.text();
    throw new Error(`${method} ${path}: erwartet ${expected}, erhalten ${response.status}: ${text.slice(0, 1000)}`);
  }
  return response;
}

async function jsonRequest(path, options) {
  const response = await request(path, options);
  return response.json();
}

async function registerAndVerify(name, email, password) {
  const response = await request('/api/auth/register', {
    method: 'POST',
    json: { name, email, password },
    expected: 201
  });
  const cookie = cookieFrom(response);
  const data = await response.json();
  assert.equal(data.user.email, email);
  assert.equal(data.user.emailVerified, false);

  const verifyToken = tokenFromDebugUrl(data.debugUrl, 'verify');
  const verified = await jsonRequest('/api/auth/verify-email', {
    method: 'POST',
    json: { token: verifyToken }
  });
  assert.equal(verified.user.emailVerified, true);
  return { cookie, user: verified.user };
}

async function main() {
  let a = await registerAndVerify('Mobile Test A', emailA, passwordA);
  const b = await registerAndVerify('Mobile Test B', emailB, passwordB);

  const meA = await jsonRequest('/api/auth/me', { cookie: a.cookie });
  assert.equal(meA.user.emailVerified, true);

  const invitation = await jsonRequest('/api/invitations', {
    method: 'POST',
    cookie: a.cookie,
    json: { email: emailB },
    expected: 201
  });
  assert.ok(invitation.code);

  const pending = await jsonRequest('/api/invitations/pending', { cookie: b.cookie });
  assert.ok(pending.invitations.some((item) => item.creatorEmail === emailA));

  await jsonRequest('/api/invitations/accept', {
    method: 'POST',
    cookie: b.cookie,
    json: { code: invitation.code }
  });

  await jsonRequest('/api/trust-routing/presence', {
    method: 'PUT',
    cookie: b.cookie,
    json: { status: 'available', durationMinutes: 60 }
  });

  const trustA = await jsonRequest('/api/trust-routing', { cookie: a.cookie });
  const connectionToB = trustA.connections.find((entry) => entry.person.id === b.user.id);
  assert.ok(connectionToB, 'Vertrauensverbindung fehlt');
  assert.equal(connectionToB.presence.status, 'available');

  const form = new FormData();
  form.set('reviewerId', b.user.id);
  form.set('category', 'payment');
  form.set('description', 'Mobile API E2E Testanfrage für ZweiCheck.');
  form.set('amount', '49,90');
  form.set('urgency', 'high');
  form.set('escalationReminderMinutes', '15');
  form.set('escalationAutoReroute', 'false');

  const created = await jsonRequest('/api/checks', {
    method: 'POST',
    cookie: a.cookie,
    body: form,
    expected: 201
  });
  const checkId = created.check.id;
  assert.ok(checkId);
  assert.equal(created.check.reviewerId, b.user.id);

  const checkA = await jsonRequest(`/api/checks/${checkId}`, { cookie: a.cookie });
  assert.equal(checkA.check.description, 'Mobile API E2E Testanfrage für ZweiCheck.');

  const listB = await jsonRequest('/api/checks', { cookie: b.cookie });
  assert.ok(listB.checks.some((item) => item.id === checkId));

  const routing = await jsonRequest(`/api/checks/${checkId}/routing`, { cookie: a.cookie });
  assert.equal(routing.routing.currentReviewer.id, b.user.id);

  const escalation = await jsonRequest(`/api/checks/${checkId}/escalation`, { cookie: a.cookie });
  assert.equal(escalation.escalation.exists, true);
  assert.equal(escalation.escalation.reminderMinutes, 15);

  const token = 'ab'.repeat(32);
  await jsonRequest('/api/push/native/tokens', {
    method: 'POST',
    cookie: a.cookie,
    json: { token, environment: 'sandbox' },
    expected: 201
  });
  await request('/api/push/native/tokens', {
    method: 'DELETE',
    cookie: a.cookie,
    json: { token, environment: 'sandbox' },
    expected: 204
  });

  const answered = await jsonRequest(`/api/checks/${checkId}/respond`, {
    method: 'POST',
    cookie: b.cookie,
    json: { recommendation: 'verify_personally', note: 'Bitte erst persönlich klären.' }
  });
  assert.equal(answered.check.status, 'answered');

  const activities = await jsonRequest('/api/activities?limit=50&filter=all', { cookie: a.cookie });
  assert.ok(Array.isArray(activities.activities));
  assert.ok(activities.activities.some((item) => item.checkId === checkId), 'Aktivität zur Prüfung fehlt');

  const firstActivity = activities.activities.find((item) => item.checkId === checkId);
  if (firstActivity?.readAt == null) {
    await jsonRequest(`/api/activities/${firstActivity.id}/read`, {
      method: 'PATCH',
      cookie: a.cookie
    });
  }
  await jsonRequest('/api/activities/read-all', {
    method: 'POST',
    cookie: a.cookie
  });

  const exportResponse = await request('/api/account/export', { cookie: a.cookie });
  const exported = await exportResponse.json();
  assert.equal(exported.account.email, emailA);
  assert.ok(exported.checks.some((item) => item.id === checkId));

  await jsonRequest(`/api/checks/${checkId}/close`, {
    method: 'POST',
    cookie: a.cookie
  });

  const resetRequest = await jsonRequest('/api/auth/request-password-reset', {
    method: 'POST',
    json: { email: emailA }
  });
  const resetToken = tokenFromDebugUrl(resetRequest.debugUrl, 'reset');
  await jsonRequest('/api/auth/reset-password', {
    method: 'POST',
    json: { token: resetToken, password: passwordANew }
  });

  const loginAResponse = await request('/api/auth/login', {
    method: 'POST',
    json: { email: emailA, password: passwordANew }
  });
  a = { ...a, cookie: cookieFrom(loginAResponse) };
  await loginAResponse.json();

  await request('/api/account', {
    method: 'DELETE',
    cookie: a.cookie,
    json: { password: passwordANew },
    expected: 200
  });
  await request('/api/account', {
    method: 'DELETE',
    cookie: b.cookie,
    json: { password: passwordB },
    expected: 200
  });

  console.log('Mobile API E2E: Anmeldung, Einladungen, Vertrauenskreis, Prüfung, Erinnerung, Push-Token, Antwort, Aktivitäten, Export, Passwort-Reset und Kontolöschung funktionieren.');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
