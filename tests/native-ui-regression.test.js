const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const theme = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'AppTheme.swift'), 'utf8');
const flow = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'NewCheckFlow.swift'), 'utf8');
const project = fs.readFileSync(path.join(root, 'ios', 'project.yml'), 'utf8');

test('native text entry has a clearly visible bordered surface', () => {
  assert.match(theme, /struct SeniorInputSurface/);
  assert.match(theme, /stroke\(focused \? AppTheme\.teal/);
  assert.match(flow, /TextEditor\(text: \$description\)/);
  assert.match(flow, /seniorInputSurface\(focused: descriptionFocused/);
  assert.match(flow, /Text\("Deine Beschreibung"\)/);
});

test('native optional amount and advanced selectors use the same visible input language', () => {
  assert.match(flow, /seniorInputSurface\(focused: amountFocused\)/);
  assert.match(flow, /Wer soll sonst helfen\? \(optional\)/);
  assert.match(flow, /Soll ZweiCheck erinnern\?/);
  assert.match(flow, /Nach 120 Minuten/);
});

test('native release build number is 4 for app and share extension', () => {
  const matches = project.match(/CURRENT_PROJECT_VERSION: 4/g) || [];
  assert.equal(matches.length, 2);
});
