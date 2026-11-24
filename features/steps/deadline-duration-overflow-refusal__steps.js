'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const slug = 'deadline-duration-overflow-refusal';
const prefix = slug + ': ';
const pkg = './cmd/kogen-loop';
const testName = 'TestObserveDeadlineValidation';
// Go's time.Duration is signed int64 nanoseconds. Divide before using seconds as an input.
const maxWholeSeconds = ((1n << 63n) - 1n) / 1000000000n;

function inputSeconds(caseName) {
  switch (caseName) {
    case 'first above maximum': return String(maxWholeSeconds + 1n);
    case 'maximum': return String(maxWholeSeconds);
    case 'zero': return '0';
    case 'negative one': return '-1';
    default: throw new Error(`unknown deadline case: ${caseName}`);
  }
}
let scratch;
let validator;
let cli;

function temp() {
  return scratch ??= fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), slug + '-'));
}

function build(args) {
  const result = spawnSync('go', args, {encoding: 'utf8', timeout: 80000});
  assert.equal(result.status, 0, `go ${args.join(' ')}: ${result.error ?? ''}\n${result.stdout}${result.stderr}`);
}

function observeValidation(seconds, root) {
  if (!validator) {
    const target = path.join(temp(), 'validate');
    const overlay = path.join(temp(), 'overlay.json');
    fs.writeFileSync(overlay, JSON.stringify({Replace: {
      [path.resolve(pkg, 'shape_deadline_probe_test.go')]: path.join(__dirname, slug + '__driver', 'probe_test.go.txt'),
    }}));
    build(['test', '-c', '-overlay', overlay, '-o', target, pkg]);
    validator = target;
  }
  const output = path.join(fs.mkdtempSync(path.join(temp(), 'result-')), 'validation.json');
  const args = ['-test.run=^' + testName + '$', '--', root, seconds, output];
  const result = spawnSync(validator, args, {encoding: 'utf8', timeout: 5000});
  const diagnostic = `${pkg} ${testName} (${args[0]}): exit=${result.status}, signal=${result.signal}; ${result.error ?? ''}\n${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, diagnostic);
  assert.ok(fs.existsSync(output), `Test wrote no validation result: ${diagnostic}`);
  return JSON.parse(fs.readFileSync(output, 'utf8'));
}

function observeCLI(seconds, root) {
  if (!cli) {
    const target = path.join(temp(), 'kogen-loop');
    build(['build', '-o', target, pkg]);
    cli = target;
  }
  const home = fs.mkdtempSync(path.join(temp(), 'home-'));
  const input = JSON.stringify({protocol: 'kogen-loop/v1', root, prompt: 'fixture prompt',
    role: {provider: 'chatgpt', model: 'fixture-model'}, deadline_seconds: Number(seconds)});
  const result = spawnSync(cli, ['run', '--task', '-'], {input, encoding: 'utf8', timeout: 5000,
    cwd: root, env: {HOME: home, PATH: process.env.PATH}});
  assert.ifError(result.error);
  return {exit: result.status, events: result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))};
}

function accepted(result, root) {
  assert.equal(Object.hasOwn(result, 'error'), false, `validation unexpectedly refused the task: ${JSON.stringify(result)}`);
  assert.equal(result.root, root, 'validation did not return the task root');
}

function invalidTask(error) {
  assert.ok(error, 'expected an invalid-task refusal; the validator accepted the task');
  assert.deepEqual([error.class, error.reason], ['loop', 'invalid_task']);
}

function invalidValidation(result) {
  invalidTask(result.error);
  assert.equal(result.error.exit, 2);
  return result.error.detail;
}

function namesDeadline(detail, field, seconds) {
  // Match the input tokens, not just a substring of an unrelated name or number.
  const words = detail.match(/[+-]?\w+/g) ?? [];
  assert.ok(words.includes(field), `refusal did not name ${field}: ${detail}`);
  assert.ok(words.includes(seconds), `refusal did not name ${seconds}: ${detail}`);
}

function invalidCLI(result, field, seconds) {
  const {exit, events} = result;
  assert.equal(exit, 2, `expected invalid-task exit; got ${JSON.stringify(result)}`);
  assert.deepEqual(events.map(e => e.type), ['error', 'session.ended']);
  const [error, end] = events;
  invalidTask(error);
  namesDeadline(error.detail, field, seconds);
  assert.equal(end.status, 'failed');
  assert.equal(end.exit, 2);
}

function register() {
  const {When, Then, AfterAll} = require('@cucumber/cucumber');
  When(prefix + 'validate a task with deadline_seconds {string}', {timeout: 100000}, function (caseName) {
    this.seconds = inputSeconds(caseName);
    this.root = fs.mkdtempSync(path.join(temp(), 'root-'));
    this.validation = observeValidation(this.seconds, this.root);
  });
  Then(prefix + 'validation refuses the task, naming {string} and the supplied value', function (field) {
    namesDeadline(invalidValidation(this.validation), field, this.seconds);
  });
  Then(prefix + 'validation accepts the task without running a round', function () {
    accepted(this.validation, this.root);
  });
  Then(prefix + 'validation refuses the negative deadline', function () {
    invalidValidation(this.validation);
  });
  When(prefix + 'pipe a task with deadline_seconds {string} to kogen-loop run --task -', {timeout: 100000}, function (caseName) {
    this.seconds = inputSeconds(caseName);
    const root = fs.mkdtempSync(path.join(temp(), 'root-'));
    this.cli = observeCLI(this.seconds, root);
  });
  Then(prefix + 'the CLI refuses the task with exit 2, naming {string} and the supplied value before starting a session', function (field) {
    invalidCLI(this.cli, field, this.seconds);
  });
  AfterAll(function () {
    if (scratch) fs.rmSync(scratch, {recursive: true, force: true});
  });
}

// Focused observer controls: validate observation shapes without patching production code.
function control(mode) {
  const field = 'deadline_seconds';
  const seconds = inputSeconds('first above maximum');
  const error = {class: 'loop', reason: 'invalid_task', exit: 2, detail: `${field} ${seconds} exceeds duration range`};
  try {
    const root = fs.mkdtempSync(path.join(temp(), 'root-'));
    const max = observeValidation(inputSeconds('maximum'), root);
    const zero = observeValidation('0', root);
    const negative = observeValidation('-1', root);
    // Use the existing negative CLI refusal envelope; supply only the new overflow detail.
    const cliOutcome = observeCLI('-1', root);
    invalidCLI(cliOutcome, field, 'negative');
    cliOutcome.events[0].detail = error.detail;
    if (mode === 'good') {
      accepted(max, root);
      accepted(zero, root);
      invalidValidation(negative);
      namesDeadline(invalidValidation({root: '', error}), field, seconds);
      invalidCLI(cliOutcome, field, seconds);
      console.log('deadline observer accepted');
    } else if (mode === 'bad') {
      assert.throws(() => invalidValidation(max), /validator accepted/);
      assert.throws(() => accepted(negative, root), /unexpectedly refused/);
      assert.throws(() => invalidValidation(zero), /validator accepted/);
      assert.throws(() => namesDeadline('deadline_seconds exceeds duration range', field, seconds), new RegExp(`did not name ${seconds}`));
      assert.throws(() => namesDeadline(`deadline ${seconds} exceeds duration range`, field, seconds), /did not name deadline_seconds/);
      const started = {exit: 2, events: [cliOutcome.events[0], {type: 'session.started'}, cliOutcome.events[1]]};
      assert.throws(() => invalidCLI(started, field, seconds), {code: 'ERR_ASSERTION'});
      console.log('deadline observer rejected');
      process.exitCode = 1;
    } else {
      throw new Error('want observer mode good or bad');
    }
  } finally {
    if (scratch) fs.rmSync(scratch, {recursive: true, force: true});
  }
}

if (require.main === module) {
  try {
    control(process.argv[2]);
  } catch (error) {
    console.error(error);
    process.exitCode = 2;
  }
} else {
  register();
}
