'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const prefix = 'foreign-protocol-refusal-regression: ';
const pkg = './cmd/kogen-loop';
const main = 'cmd/kogen-loop/main.go';
const test = 'cmd/kogen-loop/main_test.go';
const decodeFirst = 'decode fields first';
const misclassify = 'classify field errors as unsupported protocol';

function scratch(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix.split(':')[0] + '-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

function run(program, args, options = {}) {
  const result = spawnSync(program, args, {encoding: 'utf8', timeout: 45000, ...options});
  assert.ifError(result.error);
  assert.equal(result.signal, null, `${program} ${args.join(' ')}: signal`);
  return result;
}

function alteredMain(mutation) {
  const source = fs.readFileSync(main, 'utf8');
  if (mutation === decodeFirst) {
    const start = source.indexOf('\n\t// A task of another protocol is refused as such before its fields are judged.');
    const end = source.indexOf('\n\ttask, err := api.DecodeTask', start);
    assert.ok(start !== -1 && end > start, 'cannot isolate the protocol peek for the control');
    return source.slice(0, start) + source.slice(end);
  }
  assert.equal(mutation, misclassify, 'unknown control');
  const from = 'return api.Task{}, sys.Fail(api.ErrClassLoop, api.ErrInvalidTask, err.Error(), api.ExitInvalid)';
  assert.equal(source.split(from).length, 2, 'cannot isolate the field-decoding refusal for the control');
  return source.replace(from, 'return api.Task{}, unsupportedProtocol(api.Protocol)');
}

function overlay(dir, files) {
  const Replace = {};
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(dir, path.basename(name));
    fs.writeFileSync(target, content);
    Replace[path.resolve(name)] = target;
  }
  const spec = path.join(dir, 'overlay.json');
  fs.writeFileSync(spec, JSON.stringify({Replace}));
  return ['-overlay', spec];
}

function cli(input, mutation) {
  return scratch(dir => {
    const bin = path.join(dir, 'kogen-loop');
    const opts = mutation ? overlay(dir, {[main]: alteredMain(mutation)}) : [];
    const build = run('go', ['build', ...opts, '-o', bin, pkg]);
    assert.equal(build.status, 0, `go build ${pkg}: ${build.stdout}${build.stderr}`);
    const home = path.join(dir, 'home');
    fs.mkdirSync(home);
    return run(bin, ['run', '--task', '-'], {
      cwd: dir, input, timeout: 10000, env: {PATH: process.env.PATH, HOME: home},
    });
  });
}

function checkRefusal(result, expected) {
  assert.equal(result.status, 2, `CLI process exit: ${result.stdout}${result.stderr}`);
  const events = result.stdout.trimEnd().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(events.map(event => event.type), ['error', 'session.ended'], 'refusal event order');
  const [error, end] = events;
  assert.deepEqual([error.class, end.status, end.exit], ['loop', 'failed', 2], 'refusal class and ending');
  assert.equal(error.reason, expected.reason, `CLI refusal reason: got ${error.reason}, want ${expected.reason}`);
  assert.equal(error.detail, expected.detail, `CLI refusal detail: got ${JSON.stringify(error.detail)}`);
}

function suite(mutation, testSource) {
  return scratch(dir => {
    const files = {};
    if (mutation) files[main] = alteredMain(mutation);
    if (testSource !== undefined) files[test] = testSource;
    const opts = Object.keys(files).length ? overlay(dir, files) : [];
    const result = run('go', ['test', ...opts, '-json', '-count=1', pkg]);
    const events = result.stdout.trimEnd().split('\n').map(line => JSON.parse(line));
    const diagnostic = `go test ${pkg}${mutation ? ` (${mutation})` : ''}: ${result.stdout}${result.stderr}`;
    assert.ok(!events.some(event => event.Action === 'build-fail'), diagnostic);
    const terminal = events.filter(event => !event.Test && ['pass', 'fail'].includes(event.Action));
    assert.equal(terminal.length, 1, diagnostic);
    const ran = new Set(events.filter(event => event.Action === 'run').map(event => event.Test));
    const completed = terminal[0].Action;
    assert.equal(result.status, completed === 'pass' ? 0 : 1, diagnostic);
    assert.ok(events.some(event => event.Test && ran.has(event.Test) && event.Action === completed), diagnostic);
    return {completed, diagnostic};
  });
}

function checkCoverage(original, altered, mutation) {
  assert.equal(original.completed, 'pass', original.diagnostic);
  assert.equal(altered.completed, 'fail', `No regression test caught ${mutation}: all tests passed in the deliberately altered package`);
}

if (require.main !== module) {
  const {When, Then} = require('@cucumber/cucumber');
  When(prefix + 'I send this task to the built CLI on standard input:', {timeout: 60000}, function (input) {
    this.protocolCLI = cli(input);
  });
  Then(prefix + 'the CLI exits 2 before starting a session and reports this refusal:', function (expected) {
    checkRefusal(this.protocolCLI, JSON.parse(expected));
  });
  When(prefix + 'I run the package tests as written and with the wrong implementation {string}', {timeout: 100000}, function (mutation) {
    this.protocolCoverage = {mutation, original: suite(), altered: suite(mutation)};
  });
  Then(prefix + 'the original package tests pass and a test fails with the wrong implementation', function () {
    const {original, altered, mutation} = this.protocolCoverage;
    checkCoverage(original, altered, mutation);
  });
} else {
  // Observer controls use real subprocess output, not fabricated go test JSON.
  const controls = require('../../.kogen/intents/foreign-protocol-refusal-regression/controls.json');
  const good = process.argv[2] === 'good';
  assert.ok(good || process.argv[2] === 'bad', 'expected good or bad observer control');
  const testSource = good ? controls.correct.files[test] : controls.wrong.find(control => control.name === 'leaves the regression untested').files[test];
  const original = suite(undefined, testSource);
  const fixtures = [
    [decodeFirst, 'kogen-loop/v2', {reason: 'unsupported_protocol', detail: 'the task has protocol "kogen-loop/v2"; this build speaks "kogen-loop/v1"'}],
    [misclassify, 'kogen-loop/v1', {reason: 'invalid_task', detail: 'invalid task: unknown field "unknown_field"'}],
  ];
  for (const [mutation, protocol, expected] of fixtures) {
    const input = JSON.stringify({protocol, unknown_field: true});
    const altered = suite(mutation, testSource);
    if (good) {
      checkRefusal(cli(input), expected);
      checkCoverage(original, altered, mutation);
    } else {
      assert.throws(() => checkRefusal(cli(input, mutation), expected), {message: /^CLI refusal reason:/});
      const originalResult = cli(input);
      const firstLine = JSON.parse(originalResult.stdout.split('\n')[0]);
      const shortDetail = {...firstLine, detail: firstLine.detail.replace('"kogen-loop/v1"', '').replace('"unknown_field"', '')};
      const changed = {...originalResult, stdout: originalResult.stdout.replace(JSON.stringify(firstLine), JSON.stringify(shortDetail))};
      assert.throws(() => checkRefusal(changed, expected), {message: /^CLI refusal detail:/});
      assert.throws(() => checkCoverage(original, altered, mutation), {message: /^No regression test caught /});
    }
  }
  console.log(good ? 'recognized both refusals and both test-detected regressions' : 'rejected wrong reasons, truncated details, and uncaught regressions');
  if (!good) process.exitCode = 1;
}
