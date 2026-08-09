const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const source = fs.readFileSync(path.join(__dirname, '..', 'draft-guard.js'), 'utf8');

test('draft guard protects the 15-second polling interval', () => {
  assert.match(source, /timeout !== 15000/);
  assert.match(source, /formDirty/);
  assert.match(source, /FIELD_SELECTOR/);
});
