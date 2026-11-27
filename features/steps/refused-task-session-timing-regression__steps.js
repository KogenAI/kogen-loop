'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const prefix = 'refused-task-session-timing-regression: ';
const pkg = './cmd/kogen-loop';
const main = 'cmd/kogen-loop/main.go';
const test = 'cmd/kogen-loop/main_test.go';

// Each wrong implementation is a scratch edit of main.go: [text that must occur once, replacement].
const mutations = {
  'nonzero session wall time': ['timing["session_wall_ms"] = int64(0)', 'timing["session_wall_ms"] = int64(1)'],
  'absent overhead field': ['timing := out.sess.Timing()\n', 'timing := out.sess.Timing()\n\tdelete(timing, "overhead_ms")\n'],
  'null tool map': ['timing := out.sess.Timing()\n', 'timing := out.sess.Timing()\n\ttiming["tool_ms"] = nil\n'],
  'no error event': ['\t\tout.failure(err)\n\t\treturn api.StatusFailed, exitOf(err)', '\t\treturn api.StatusFailed, exitOf(err)'],
  'failed exit code for a refused task': ['return api.ExitInvalid\n\t}\n\treturn api.ExitFailed', 'return api.ExitFailed\n\t}\n\treturn api.ExitFailed'],
};
const timingMutations = ['nonzero session wall time', 'absent overhead field', 'null tool map'];
const refusalMutations = ['no error event', 'failed exit code for a refused task'];

function scratch(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refused-task-session-timing-'));
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

function alteredMain(name) {
  assert.ok(mutations[name], `unknown wrong implementation ${name}`);
  const [from, to] = mutations[name];
  const source = fs.readFileSync(main, 'utf8');
  assert.equal(source.split(from).length, 2, `cannot isolate the text for wrong implementation ${name}`);
  return source.replace(from, to);
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

// The built CLI run as `kogen-loop run` with no task argument, in an empty directory and HOME.
function cli(mutation) {
  return scratch(dir => {
    const bin = path.join(dir, 'kogen-loop');
    const opts = mutation ? overlay(dir, {[main]: alteredMain(mutation)}) : [];
    const build = run('go', ['build', ...opts, '-o', bin, pkg]);
    assert.equal(build.status, 0, `go build ${pkg}: ${build.stdout}${build.stderr}`);
    const home = path.join(dir, 'home');
    fs.mkdirSync(home);
    return run(bin, ['run'], {cwd: dir, input: '', timeout: 10000, env: {PATH: process.env.PATH, HOME: home}});
  });
}

function events(result, label) {
  return result.stdout.trimEnd().split('\n').map(line => {
    try {
      return JSON.parse(line);
    } catch (err) {
      assert.fail(`${label}: stdout line ${JSON.stringify(line)} is not JSON`);
    }
  });
}

function checkTiming(result) {
  const list = events(result, 'timing');
  const end = list[list.length - 1];
  assert.equal(end.type, 'session.ended', `timing: the final event is ${end.type}, want session.ended`);
  const zero = {wall_ms: 0, provider_wait_ms: 0, backoff_ms: 0, tool_ms: {}, tool_wall_ms: 0, overhead_ms: 0, session_wall_ms: 0};
  assert.deepEqual(end.timing, zero, `timing: session.ended timing is ${JSON.stringify(end.timing)}`);
}

function checkRefusal(result) {
  assert.equal(result.status, 2, `refusal: CLI process exit ${result.status}: ${result.stdout}${result.stderr}`);
  const list = events(result, 'refusal');
  assert.deepEqual(list.map(event => event.type), ['error', 'session.ended'], 'refusal: event order');
  const [error, end] = list;
  assert.deepEqual([error.class, error.reason], ['loop', 'invalid_task'], 'refusal: error class and reason');
  assert.deepEqual([end.status, end.exit], ['failed', 2], 'refusal: session.ended status and exit');
}

function suite(mutation, testSource) {
  return scratch(dir => {
    const files = {};
    if (mutation) files[main] = alteredMain(mutation);
    if (testSource !== undefined) files[test] = testSource;
    const opts = Object.keys(files).length ? overlay(dir, files) : [];
    const result = run('go', ['test', ...opts, '-json', '-count=1', pkg]);
    const list = result.stdout.trimEnd().split('\n').map(line => JSON.parse(line));
    const diagnostic = `go test ${pkg}${mutation ? ` (${mutation})` : ''}: ${result.stdout}${result.stderr}`;
    assert.ok(!list.some(event => event.Action === 'build-fail'), diagnostic);
    const terminal = list.filter(event => !event.Test && ['pass', 'fail'].includes(event.Action));
    assert.equal(terminal.length, 1, diagnostic);
    const ran = new Set(list.filter(event => event.Action === 'run').map(event => event.Test));
    const completed = terminal[0].Action;
    assert.equal(result.status, completed === 'pass' ? 0 : 1, diagnostic);
    assert.ok(list.some(event => event.Test && ran.has(event.Test) && event.Action === completed), diagnostic);
    return {completed, diagnostic};
  });
}

function coverage(names, testSource) {
  return {original: suite(undefined, testSource), altered: names.map(name => [name, suite(name, testSource)])};
}

function checkCoverage({original, altered}) {
  assert.equal(original.completed, 'pass', original.diagnostic);
  for (const [name, result] of altered) {
    assert.equal(result.completed, 'fail', `No regression test caught wrong implementation "${name}": all tests passed`);
  }
}

if (require.main !== module) {
  const {When, Then} = require('@cucumber/cucumber');
  When(prefix + 'I run the built CLI with no task argument', {timeout: 60000}, function () {
    this.refusedRun = cli();
  });
  Then(prefix + 'the CLI ends with a session.ended event whose timing is all zero with an empty tool_ms', function () {
    checkTiming(this.refusedRun);
  });
  Then(prefix + 'the CLI exits 2 after an error event and then a failed session.ended event with exit 2', function () {
    checkRefusal(this.refusedRun);
  });
  When(prefix + 'I run the package tests as written and with each of these wrong implementations:', {timeout: 110000}, function (table) {
    this.refusedCoverage = coverage(table.raw().map(row => row[0]));
  });
  Then(prefix + 'the original package tests pass and a test fails with each wrong implementation', function () {
    checkCoverage(this.refusedCoverage);
  });
} else {
  // Observer controls use real subprocess output, not fabricated go test JSON.
  const controls = require('../../.kogen/intents/refused-task-session-timing-regression/controls.json');
  const good = process.argv[2] === 'good';
  assert.ok(good || process.argv[2] === 'bad', 'expected good or bad observer control');
  const testSource = good ? controls.correct.files[test] : controls.wrong.find(control => control.name === 'leaves the regression untested').files[test];
  const all = [...timingMutations, ...refusalMutations];
  const result = coverage(all, testSource);
  if (good) {
    const original = cli();
    checkTiming(original);
    checkRefusal(original);
    checkCoverage(result);
  } else {
    assert.throws(() => checkCoverage(result), {message: /^No regression test caught /});
    for (const name of timingMutations) assert.throws(() => checkTiming(cli(name)), {message: /^timing:/});
    for (const name of refusalMutations) assert.throws(() => checkRefusal(cli(name)), {message: /^refusal:/});
    // A zero timing observation with a wrong shape is rejected as well.
    const ok = cli();
    const end = JSON.parse(ok.stdout.trimEnd().split('\n').pop());
    end.timing.tool_ms = null;
    assert.throws(() => checkTiming({stdout: JSON.stringify(end) + '\n'}), {message: /^timing:/});
  }
  console.log(good ? 'recognized the zero timing, the refusal, and every test-detected regression' : 'rejected wrong timings, wrong refusals, and uncaught regressions');
  if (!good) process.exitCode = 1;
}
