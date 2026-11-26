'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');

const prefix = 'provider-usage-invariant-overflow: ';
const driver = './features/steps/provider-usage-invariant-overflow__driver/main.go';

function observe(counts) {
  return execFileSync('go', ['run', driver, ...counts], {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
    timeout: 90000,
  });
}

function check(actual, expected, counts) {
  assert.equal(actual, `${expected}\n`, `KnownUsage.State for input/cached/write/30m/12h/output/reasoning: ${counts.join(' ')}`);
}

if (require.main === module) {
  const valid = ['max', '0', 'max', 'max-1', '1', '1', '0'];
  const invalid = ['max', '0', 'max', 'max', '1', '1', '0'];
  const validState = observe(valid);
  const invalidState = observe(invalid);
  switch (process.argv[2]) {
    case 'good':
      check(validState, 'known', valid);
      check(invalidState, 'inconsistent', invalid);
      console.log('state observer accepted known and inconsistent results');
      break;
    case 'bad':
      assert.throws(() => check(validState, 'inconsistent', valid), {code: 'ERR_ASSERTION'});
      assert.throws(() => check(invalidState, 'known', invalid), {code: 'ERR_ASSERTION'});
      console.log('state observer rejected swapped results');
      process.exitCode = 1;
      break;
    default:
      throw new Error('expected good or bad observer control');
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When(prefix + 'classify input {string}, cached {string}, write {string}, 30m {string}, 12h {string}, output {string}, reasoning {string}', {timeout: 100000}, function (input, cached, write, write30m, write12h, output, reasoning) {
    this.usageCounts = [input, cached, write, write30m, write12h, output, reasoning];
    this.usageState = observe(this.usageCounts);
  });
  Then(prefix + 'the usage state is {string}', function (expected) {
    check(this.usageState, expected, this.usageCounts);
  });
}
