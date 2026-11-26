'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const prefix = 'usage-sum-overflow-safe: ';
const driver = './features/steps/usage-sum-overflow-safe__driver/main.go';

function observe(rows) {
  const result = spawnSync('go', ['run', driver], {
    cwd: path.resolve(__dirname, '../..'),
    input: JSON.stringify(rows),
    encoding: 'utf8',
    timeout: 90000,
  });
  const context = `go run ${driver} with ${JSON.stringify(rows)}`;
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${context}: ${result.stdout}${result.stderr}`);
  // Keep the exact Go decimal lexeme rather than rounding it to a JS Number.
  const observation = JSON.parse(result.stdout, (_key, value, token) =>
    typeof value === 'number' ? BigInt(token.source) : value);
  return observation;
}

function check(observation, expected) {
  const max = (1n << (observation.int_size - 1n)) - 1n;
  const parse = value => {
    switch (value) {
      case 'nil': return null;
      case 'max': return max;
      case 'max-1': return max - 1n;
      default: return BigInt(value);
    }
  };
  const [input, cached, output, reasoning, state, source] = expected;
  assert.deepStrictEqual(observation.usage, {
    input: parse(input), cached: parse(cached), output: parse(output), reasoning: parse(reasoning), state, source,
  });
}

function register() {
  const {When, Then} = require('@cucumber/cucumber');
  When(prefix + 'sum these usages', {timeout: 100000}, function (table) {
    assert.deepStrictEqual(table.raw()[0], ['input', 'cached', 'output', 'reasoning']);
    this.usageSumObservation = observe(table.rows());
  });
  Then(prefix + 'the sum is input {string}, cached {string}, output {string}, reasoning {string}, state {string}, source {string}', function (input, cached, output, reasoning, state, source) {
    check(this.usageSumObservation, [input, cached, output, reasoning, state, source]);
  });
}

function control(mode) {
  const complete = observe([['max-1', '2', '5', '1'], ['1', '1', '6', '2']]);
  const completeExpected = ['max', '3', '11', '3', 'complete', 'provider'];
  const partial = observe([['10', '2', '5', '1'], ['10', 'nil', '5', 'nil']]);
  const partialExpected = ['20', 'nil', '10', 'nil', 'partial', 'provider'];
  check(complete, completeExpected);
  check(partial, partialExpected);
  if (mode === 'good') {
    console.log('usage observer accepted exact counts and missing categories');
  } else if (mode === 'bad') {
    for (const [key, value] of Object.entries({
      input: complete.usage.input - 1n, cached: 0n, output: 0n, reasoning: 0n, state: 'partial', source: '',
    })) {
      const usage = {...complete.usage, [key]: value};
      assert.throws(() => check({...complete, usage}, completeExpected), {code: 'ERR_ASSERTION'});
    }
    const usage = {...partial.usage, cached: 0n};
    assert.throws(() => check({...partial, usage}, partialExpected), {code: 'ERR_ASSERTION'});
    console.log('usage observer rejected altered counts, state and source');
    process.exitCode = 1;
  } else {
    throw new Error('expected good or bad observer control');
  }
}

if (require.main === module) {
  control(process.argv[2]);
} else {
  register();
}
