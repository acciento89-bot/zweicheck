'use strict';

const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync('escalation-client.js', 'utf8');

test('reminder choices stay consistently expressed in minutes', () => {
  assert.match(source, /const values = \[5, 15, 30, 60, 120\]/);
  assert.match(source, /const label = `\$\{minutes\} Minuten`/);
  assert.doesNotMatch(source, />1 Stunde</);
  assert.doesNotMatch(source, />2 Stunden</);
});

test('detail reminder controls are not rebuilt just because the user changes a select', () => {
  assert.match(source, /function renderKey\(escalation\)/);
  assert.match(source, /zcEscalationRenderKey/);
  assert.doesNotMatch(source, /card\.innerHTML\s*!==\s*html/);
});

test('countdowns update without replacing the reminder form', () => {
  assert.match(source, /data-zc-escalation-countdown/);
  assert.match(source, /reminderCountdown\.textContent\s*=\s*remainingText/);
  assert.match(source, /rerouteCountdown\.textContent\s*=\s*remainingText/);
});
