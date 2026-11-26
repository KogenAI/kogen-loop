'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const driver = './features/steps/event-envelope-collision-guard__driver';

function marshal(envelope, fields) {
  const output = execFileSync('go', ['run', driver], {
    input: JSON.stringify({...envelope, fields}), encoding: 'utf8', timeout: 25000,
  });
  return JSON.parse(output);
}

function checkError(result, expected) {
  assert.equal(result.error, expected, `expected MarshalJSON error ${JSON.stringify(expected)}; got ${JSON.stringify(result)}`);
}

function checkEncoding(result, expected) {
  assert.equal(result.error, null, `ordinary fields must marshal without error; got ${JSON.stringify(result)}`);
  assert.deepEqual(JSON.parse(result.json), expected);
}

if (require.main === module) {
  const mode = process.argv[2];
  assert.ok(mode === 'good' || mode === 'bad');
  const envelope = {protocol: 'kogen-loop/v1', seq: 1, time: '2026-01-01T00:00:00Z', type: 'request.started'};
  const fields = {n: 3, model: 'test-model'};
  const want = {...envelope, ...fields};
  const collision = mode === 'good' ? marshal(envelope, {seq: 2}) : {error: null, json: JSON.stringify({...envelope, seq: 2})};
  const flat = mode === 'good' ? marshal(envelope, fields) : {error: null, json: JSON.stringify({...envelope, fields})};
  const ordinary = mode === 'good' ? flat : {error: 'fields rejected', json: ''};
  const checks = [
    () => checkError(collision, 'event field "seq" collides with the envelope'),
    () => checkEncoding(flat, want),
    () => checkEncoding(ordinary, want),
  ];
  let rejected = 0;
  for (const check of checks) {
    try {
      check();
    } catch (error) {
      if (!(error instanceof assert.AssertionError)) throw error;
      rejected++;
    }
  }
  console.log(`observer rejected ${rejected} of ${checks.length}`);
  process.exitCode = rejected === 0 ? 0 : 1;
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  const prefix = 'event-envelope-collision-guard: ';

  Given(prefix + 'an event with this envelope', function (json) {
    this.envelope = JSON.parse(json);
  });

  When(prefix + 'MarshalJSON is called with these fields', {timeout: 30000}, function (json) {
    this.result = marshal(this.envelope, JSON.parse(json));
  });

  Then(prefix + 'the error is {string}', function (expected) {
    checkError(this.result, expected);
  });

  Then(prefix + 'encoding succeeds with this JSON object', function (json) {
    checkEncoding(this.result, JSON.parse(json));
  });
}
