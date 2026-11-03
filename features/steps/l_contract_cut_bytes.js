'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {Then} = require('@cucumber/cucumber');
Then('the local cut recording for {string} equals head unit {string} repeated {int} and marker {string} and tail unit repeated {int}', function(kind, unit, head, marker, tail) {
  const atom = unit === 'line' ? 'x'.repeat(79) + '\n' : unit;
  const expected = atom.repeat(head) + (marker ? '\n' + marker + '\n' : '') + atom.repeat(tail);
  const recordings = JSON.parse(fs.readFileSync('contract/testdata/cut_bytes.json', 'utf8'));
  assert.equal(recordings[kind], expected, 'checked-in contract recording for ' + kind);
  assert.deepEqual(this.lineResult, [expected, expected], 'real tools.Cut delivery and idempotence for ' + kind);
});
