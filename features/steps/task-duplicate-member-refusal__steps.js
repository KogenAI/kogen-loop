'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const driver = './features/steps/task-duplicate-member-refusal__driver';

function decode(input) {
  // A compiler or helper-process failure throws here, before assertions about
  // a DecodeTask diagnostic. Normal refusals are reported as JSON on stdout.
  const output = execFileSync('go', ['run', driver], {input, encoding: 'utf8', timeout: 25000});
  return JSON.parse(output);
}

function namesKey(result, key) {
  assert.ok(typeof result.error === 'string' && result.error.includes(key),
    `expected DecodeTask to refuse the input and name ${JSON.stringify(key)}; got ${JSON.stringify(result)}`);
}

function exactError(result, detail) {
  assert.equal(result.error, detail);
}

function decodedFields(result, expected) {
  const fields = Object.fromEntries(Object.keys(expected).map(key => [key, result.task?.[key]]));
  assert.deepEqual({error: result.error, fields}, {error: null, fields: expected});
}

if (require.main === module) {
  // Focused observer checks against the real bridge, independent of duplicate support.
  const task = decode(' \n{"prompt":"hello","role":{"model":"m"},"session":{"resume":true}}\t\n');
  const unknown = decode('{"role":{"surprise_role_field":1}}');
  const trailing = decode('{} {}');
  const expected = {prompt: 'hello', role: {provider: '', model: 'm', effort: '', base_url: ''},
    session: {dir: '', resume: true}};
  const trailingDetail = 'invalid task: trailing data after the task object';
  const probes = process.argv[2] === 'good' ? [
    () => namesKey(unknown, 'surprise_role_field'),
    () => exactError(trailing, trailingDetail),
    () => decodedFields(task, expected),
  ] : [
    () => namesKey(task, 'prompt'),
    () => exactError(unknown, trailingDetail),
    () => decodedFields(task, {...expected, session: {dir: '', resume: false}}),
  ];
  let rejected = 0;
  for (const check of probes) {
    try {
      check();
    } catch (error) {
      if (!(error instanceof assert.AssertionError)) throw error;
      rejected++;
    }
  }
  console.log(`observer rejected ${rejected} of ${probes.length}`);
  process.exitCode = rejected === 0 ? 0 : 1;
} else {
  const {When, Then} = require('@cucumber/cucumber');
  const prefix = 'task-duplicate-member-refusal: ';

  When(prefix + 'DecodeTask reads the JSON', {timeout: 30000}, function (json) {
    this.result = decode(json);
  });

  When(prefix + 'DecodeTask reads the JSON with surrounding whitespace', {timeout: 30000}, function (json) {
    this.result = decode(' \n' + json + '\t\n');
  });

  When(prefix + 'DecodeTask reads a task with {string} written both plainly and with a JSON escape',
    {timeout: 30000}, function (key) {
      const plain = JSON.stringify(key);
      const escape = '\\u' + key.charCodeAt(0).toString(16).padStart(4, '0');
      const escaped = '"' + escape + plain.slice(2);
      this.result = decode(`{${plain}:"first",${escaped}:"last"}`);
    });

  Then(prefix + 'the decode error names {string}', function (key) {
    namesKey(this.result, key);
  });

  Then(prefix + 'the decode error is {string}', function (detail) {
    exactError(this.result, detail);
  });

  Then(prefix + 'the decode succeeds with these task fields', function (json) {
    decodedFields(this.result, JSON.parse(json));
  });
}
