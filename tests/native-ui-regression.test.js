const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const theme = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'AppTheme.swift'), 'utf8');
const flow = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'NewCheckFlow.swift'), 'utf8');
const checks = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'ChecksView.swift'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'ZoomableImageViewer.swift'), 'utf8');
const onboarding = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'OnboardingView.swift'), 'utf8');
const account = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'AccountView.swift'), 'utf8');
const premium = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'PremiumStore.swift'), 'utf8');
const app = fs.readFileSync(path.join(root, 'ios', 'ZweiCheck', 'ZweiCheckApp.swift'), 'utf8');
const project = fs.readFileSync(path.join(root, 'ios', 'project.yml'), 'utf8');

test('native text entry has a clearly visible bordered surface', () => {
  assert.match(theme, /struct SeniorInputSurface/);
  assert.match(theme, /stroke\(focused \? AppTheme\.tealBright/);
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

test('first launch onboarding explains the full ZweiCheck flow and can be reopened', () => {
  assert.match(app, /zweicheck\.onboarding\.completed/);
  assert.match(app, /OnboardingView\(completed:/);
  assert.match(onboarding, /1\. Vertrauensperson verbinden/);
  assert.match(onboarding, /2\. Verdächtiges teilen oder eingeben/);
  assert.match(onboarding, /3\. Antwort bekommen/);
  assert.match(account, /Einführung noch einmal ansehen/);
});

test('Premium Family is clearly differentiated from the free plan', () => {
  assert.match(premium, /familyYearlyTargetPrice = "39,99 €"/);
  assert.match(onboarding, /Kostenlos/);
  assert.match(onboarding, /Premium Familie/);
  assert.match(onboarding, /39,99 € \/ Jahr/);
  assert.match(flow, /imageLimit: Int \{ model\.premium\.isPremiumFamily \? 3 : 1 \}/);
  assert.match(flow, /Automatisch eine zweite Vertrauensperson/);
  assert.match(account, /Bis zu 3 Bilder pro Prüfung statt 1/);
  assert.match(account, /Automatische Erinnerung nach 5–120 Minuten/);
});

test('review actions use distinct ZweiCheck web colors', () => {
  assert.match(theme, /enum ZweiCheckActionTone/);
  assert.match(checks, /case \.doNotAct: \.danger/);
  assert.match(checks, /case \.verifyPersonally: \.warning/);
  assert.match(checks, /case \.plausible: \.positive/);
  assert.match(checks, /case \.callMe: \.navy/);
});

test('native release build number is 6 for app and share extension', () => {
  const matches = project.match(/CURRENT_PROJECT_VERSION: 6/g) || [];
  assert.equal(matches.length, 2);
});
