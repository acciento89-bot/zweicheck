const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  AUTO_REROUTE_DELAY_MINUTES,
  normalizeReminderMinutes,
  normalizeAutoReroute,
  escalationState,
  serializeEscalation
} = require('../server/escalation');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'escalation-client.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'escalation.css'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const serviceWorker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
const patch = fs.readFileSync(path.join(root, 'scripts', 'patch-server-push.js'), 'utf8');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('reminder times and auto-reroute flags are normalized safely', () => {
  assert.equal(normalizeReminderMinutes(5), 5);
  assert.equal(normalizeReminderMinutes('15'), 15);
  assert.equal(normalizeReminderMinutes(120), 120);
  assert.equal(normalizeReminderMinutes(0), null);
  assert.equal(normalizeReminderMinutes(999), null);
  assert.equal(normalizeAutoReroute(true), true);
  assert.equal(normalizeAutoReroute('on'), true);
  assert.equal(normalizeAutoReroute('false'), false);
  assert.equal(AUTO_REROUTE_DELAY_MINUTES, 15);
});

test('escalation states cover waiting, reminder, reroute and cancellation', () => {
  assert.equal(escalationState(null), 'disabled');
  assert.equal(escalationState({ escalation_id: '1' }), 'waiting_reminder');
  assert.equal(escalationState({ escalation_id: '1', reminded_at: '2026-08-12T08:00:00Z' }), 'reminded');
  assert.equal(escalationState({ escalation_id: '1', reminded_at: '2026-08-12T08:00:00Z', auto_reroute: true }), 'waiting_reroute');
  assert.equal(escalationState({ escalation_id: '1', cancelled_at: '2026-08-12T08:00:00Z' }), 'cancelled');
  assert.equal(escalationState({ escalation_id: '1', rerouted_at: '2026-08-12T08:00:00Z' }), 'rerouted');
});

test('serialized plans expose only the routing metadata needed by the client', () => {
  const requesterId = '11111111-1111-4111-8111-111111111111';
  const result = serializeEscalation({
    id: '22222222-2222-4222-8222-222222222222',
    requester_id: requesterId,
    reviewer_id: '33333333-3333-4333-8333-333333333333',
    fallback_reviewer_id: '44444444-4444-4444-8444-444444444444',
    fallback_name: 'Diana',
    status: 'open',
    reassigned_at: null,
    escalation_id: '22222222-2222-4222-8222-222222222222',
    reminder_minutes: 15,
    reminder_at: '2026-08-12T08:15:00Z',
    reminded_at: null,
    auto_reroute: true,
    reroute_at: '2026-08-12T08:30:00Z',
    rerouted_at: null,
    cancelled_at: null,
    last_error: null
  }, requesterId);

  assert.equal(result.role, 'requester');
  assert.equal(result.state, 'waiting_reminder');
  assert.equal(result.canManage, true);
  assert.equal(result.canConfigure, true);
  assert.equal(result.fallbackReviewer.name, 'Diana');
  assert.equal(Object.hasOwn(result, 'description'), false);
});

test('escalation client is additive and does not use a MutationObserver', () => {
  assert.match(client, /data-zc-escalation-create/);
  assert.match(client, /data-zc-escalation-card/);
  assert.match(client, /escalationReminderMinutes/);
  assert.match(client, /window\.setInterval\(tick, 1_000\)/);
  assert.doesNotMatch(client, /MutationObserver/);
  assert.match(css, /zc-escalation-card/);
});

test('phase 3.5 assets and server integration remain shipped', () => {
  assert.match(index, /zweicheck-build" content="escalation-v1"/);
  assert.match(index, /escalation-client\.js\?v=2/);
  assert.match(index, /escalation\.css\?v=2/);
  assert.match(serviceWorker, /zweicheck-phase3-v10/);
  assert.match(serviceWorker, /escalation-client\.js\?v=2/);
  assert.match(patch, /registerEscalationRoutes/);
  assert.match(patch, /createCheckEscalation/);
  assert.match(patch, /startEscalationWorker/);
  assert.match(patch, /check_reminder/);
});

test('phase 3.6 presents the main check flow in four simple senior-first steps', () => {
  assert.match(index, /zweicheck-ux" content="senior-first-v1"/);
  assert.match(client, /Wir gehen Schritt für Schritt/);
  assert.match(client, /Schritt \$\{number\} von 4/);
  assert.match(client, /Wer soll dir helfen\?/);
  assert.match(client, /Worum geht es\?/);
  assert.match(client, /Was ist passiert\?/);
  assert.match(client, /Alles richtig\?/);
  assert.match(client, /Mehr Möglichkeiten/);
  assert.match(client, /Ich bin unsicher – prüfen lassen/);
  assert.match(client, /Danach automatisch die zweite Person fragen/);
  assert.match(css, /zc-simple-step/);
  assert.match(css, /min-height: 54px/);
  assert.match(css, /focus-visible/);
});

test('advanced functions stay available but are hidden behind a plain-language details section', () => {
  assert.match(client, /data-zc-simple-advanced-body/);
  assert.match(client, /Wer soll sonst helfen\? \(optional\)/);
  assert.match(client, /Soll ZweiCheck nochmal erinnern\?/);
  assert.match(client, /Nein, nicht erinnern/);
  assert.match(client, /Andere Person fragen/);
  assert.doesNotMatch(client, /Eskalation optional/);
  assert.doesNotMatch(client, /Eskalationsplan/);
});

test('production lifecycle remains on the proven start path', () => {
  assert.equal(packageJson.scripts.start, 'node scripts/patch-server-push.js && node server/index.js');
  assert.match(dockerfile, /RUN node scripts\/patch-polling\.js/);
  assert.match(dockerfile, /node scripts\/patch-server-push\.js/);
  assert.doesNotMatch(packageJson.scripts.start, /escalation/);
  assert.doesNotMatch(dockerfile, /patch-server-escalation/);
});
