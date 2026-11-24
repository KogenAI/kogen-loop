'use strict';

const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {mkdtempSync, readFileSync, rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');

function observeRefusal(result, field) {
  assert.equal(typeof result.error, 'string', `expected refusal naming ${field}, got ${JSON.stringify(result)}`);
  assert.ok(result.error.includes(field), `error ${JSON.stringify(result.error)} must identify ${field}`);
}

function observeDuplicate(result, field) {
  observeRefusal(result, field);
  assert.match(result.error, /\bduplicate\b/i, 'expected a duplicate-member error before the spelling check');
}

function observeValidation(result, detail) {
  assert.equal(result.status, 2, `expected invalid-task exit 2, got ${result.status}: ${result.stderr}`);
  const events = result.stdout.trimEnd().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.map(event => event.type), ['error', 'session.ended']);
  assert.deepEqual([events[0].class, events[0].reason, events[0].detail], ['loop', 'invalid_task', detail]);
  assert.deepEqual([events[1].status, events[1].exit], ['failed', 2]);
}

function observeDecoded(result, expected) {
  assert.equal(result.error, null, `expected a decoded task, got ${JSON.stringify(result.error)}`);
  assert.ok(result.task && typeof result.task === 'object', 'expected a decoded task object');
  const fields = Object.fromEntries(Object.keys(expected).map(key => [key, result.task[key]]));
  assert.deepEqual(fields, expected, 'decoded field values must match the exact-spelling input');
}

function observeContract(markdown) {
  const taskSection = markdown.split(/^### Task \(`api\.Task`\)\s*$/m)[1]?.split(/^### /m)[0] || '';
  const prose = taskSection.replace(/```[\s\S]*?```/g, '').replace(/[`*_]/g, '').replace(/\s+/g, ' ');
  const rule = prose.split(/[.!?]\s/).some(sentence =>
    /\bfield names\b/i.test(sentence) &&
    /\b(?:must (?:exactly match|match\b.*\bexactly)|are case-sensitive)\b/i.test(sentence) &&
    /\bJSON\b/i.test(sentence) && /\brole\b/.test(sentence) && /\bsession\b/.test(sentence));
  assert.ok(rule, 'the caller contract Task section must explicitly require exact JSON field names, including in role and session');
}

if (require.main === module) {
  const good = process.argv[2] === 'good';
  assert.ok(good || process.argv[2] === 'bad', 'expected observer control good or bad');
  const expected = {prompt: 'hello', role: {model: 'm'}, session: {dir: '/tmp/s', resume: true}};
  const heading = '# kogen-loop caller contract v1\n\n### Task (`api.Task`)\n\n';
  const rule = 'Task field names must exactly match their defined JSON spelling, including inside `role` and `session`.';
  const detail = 'deadline_seconds must not be negative';
  const errorEvent = {type: 'error', class: 'loop', reason: 'invalid_task', detail: good ? detail : 'role.provider is required'};
  const endEvent = {type: 'session.ended', status: 'failed', exit: 2};
  const checks = [
    () => observeDuplicate({error: good ? 'invalid task: duplicate member "model"' : 'invalid task: unknown field "Prompt"'}, 'model'),
    () => observeValidation({status: 2, stdout: `${JSON.stringify(errorEvent)}\n${JSON.stringify(endEvent)}\n`, stderr: ''}, detail),
    () => observeRefusal(good ? {error: 'invalid task: unknown field "Prompt"', task: null} : {error: null, task: expected}, 'Prompt'),
    () => observeRefusal({error: good ? 'invalid task: unknown field "Dir"' : 'invalid task: unknown field', task: null}, 'Dir'),
    () => observeDecoded({error: null, task: good ? expected : {...expected, session: {dir: '/tmp/s', resume: false}}}, expected),
    () => observeContract(heading + (good ? rule : 'The task includes JSON field names for `role` and `session`.')),
  ];
  let rejected = 0;
  for (const check of checks) {
    try {
      check();
    } catch (error) {
      if (error.code !== 'ERR_ASSERTION') throw error;
      rejected++;
    }
  }
  console.log(`observer rejected ${rejected} of ${checks.length}`);
  process.exitCode = rejected === 0 ? 0 : 1;
} else {
  const {When, Then} = require('@cucumber/cucumber');

  When('task-field-exact-case: the caller decodes this JSON task', function (input) {
    const stdout = execFileSync('go', ['run', './features/steps/task-field-exact-case__driver'], {
      encoding: 'utf8', input,
    });
    this.exactCaseInput = input;
    this.exactCaseResult = JSON.parse(stdout);
  });

  When('task-field-exact-case: the caller runs the CLI with this JSON task on standard input', function (input) {
    const dir = mkdtempSync(join(tmpdir(), 'task-field-exact-case-'));
    const binary = join(dir, process.platform === 'win32' ? 'kogen-loop.exe' : 'kogen-loop');
    try {
      execFileSync('go', ['build', '-o', binary, './cmd/kogen-loop']);
      const result = spawnSync(binary, ['run', '--task', '-'], {encoding: 'utf8', input});
      if (result.error) throw result.error;
      assert.equal(result.signal, null, 'the CLI must exit normally');
      this.exactCaseCLIResult = result;
    } finally {
      rmSync(dir, {recursive: true, force: true});
    }
  });

  Then('task-field-exact-case: duplicate detection still reports {string} before checking field spelling', function (field) {
    observeDuplicate(this.exactCaseResult, field);
  });

  Then('task-field-exact-case: the CLI exits 2 and reports invalid_task with detail {string}', function (detail) {
    observeValidation(this.exactCaseCLIResult, detail);
  });

  Then('task-field-exact-case: decoding fails and names {string}', function (field) {
    observeRefusal(this.exactCaseResult, field);
  });

  Then('task-field-exact-case: decoding preserves those field values without an error', function () {
    observeDecoded(this.exactCaseResult, JSON.parse(this.exactCaseInput));
  });

  Then('task-field-exact-case: the caller contract requires exact JSON task field names in the task, role and session objects', function () {
    observeContract(readFileSync('docs/contract/loop-v1.md', 'utf8'));
  });
}
