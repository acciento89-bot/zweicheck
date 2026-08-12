const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const theme = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'AppTheme.swift'), 'utf8');
const flow = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'NewCheckFlow.swift'), 'utf8');
const checks = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'ChecksView.swift'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'ZoomableImageViewer.swift'), 'utf8');
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

test('native check images can be opened full screen and zoomed', () => {
  assert.match(flow, /fullScreenCover\(item: \$imagePreview\)/);
  assert.match(checks, /fullScreenCover\(item: \$preview\)/);
  assert.match(flow, /Bild antippen zum Vergrößern/);
  assert.match(checks, /Bild antippen zum Vergrößern/);
  assert.match(viewer, /struct ZoomableImageViewer/);
  assert.match(viewer, /MagnifyGesture\(\)/);
  assert.match(viewer, /DragGesture\(\)/);
  assert.match(viewer, /onTapGesture\(count: 2\)/);
  assert.match(viewer, /scale = min\(max\(baseScale \* value\.magnification, 1\), 6\)/);
});

test('native release build number is 5 for app and share extension', () => {
  const matches = project.match(/CURRENT_PROJECT_VERSION: 5/g) || [];
  assert.equal(matches.length, 2);
});
