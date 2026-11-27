'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const prefix = 'unsupported-required-capability-regression: ';
const pkg = './cmd/kogen-loop';
const main = 'cmd/kogen-loop/main.go';
const test = 'cmd/kogen-loop/main_test.go';

// Each wrong implementation is a scratch edit of main.go: [text that must occur once, replacement].
const mutations = {
  'accepts the unsupported requirement': ['\t\tif !provided[name] {', '\t\tif false && !provided[name] {'],
  'starts a session before refusing': [
    '\tfor _, name := range task.Requires {\n',
    '\tout.emit(api.EventSessionStarted, map[string]any{"session_id": "early"})\n\tfor _, name := range task.Requires {\n',
  ],
  'refuses with the failed exit code': ['which kogen-loop does not provide", name), api.ExitInvalid))', 'which kogen-loop does not provide", name), api.ExitFailed))'],
  'omits the capability name': ['fmt.Sprintf("the task requires %q, which kogen-loop does not provide", name)', '"the task requires a capability, which kogen-loop does not provide"'],
  'omits session.ended': ['\tout.emit(api.EventSessionEnded, map[string]any{"status": status, "exit": exit, "timing": timing})\n', '\t_ = status\n'],
};
const lateRefusal = 'emits the refusal after session.ended';
const sessionMutations = ['accepts the unsupported requirement', 'starts a session before refusing', 'refuses with the failed exit code', 'omits the capability name'];
const orderMutations = ['omits session.ended', lateRefusal];

function scratch(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unsupported-required-capability-'));
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

function replaceOnce(source, from, to, name) {
  assert.equal(source.split(from).length, 2, `cannot isolate the text for wrong implementation ${name}`);
  return source.replace(from, to);
}

function alteredMain(name) {
  const source = fs.readFileSync(main, 'utf8');
  if (name === lateRefusal) {
    // The error is held back and emitted once session.ended has been written.
    let out = replaceOnce(source, '\t\tout.failure(err)\n\t\treturn api.StatusFailed, exitOf(err)', '\t\tlateFailure = err\n\t\treturn api.StatusFailed, exitOf(err)', name);
    out = replaceOnce(out, '\tout.emit(api.EventSessionEnded, map[string]any{"status": status, "exit": exit, "timing": timing})\n',
      '\tout.emit(api.EventSessionEnded, map[string]any{"status": status, "exit": exit, "timing": timing})\n\tif lateFailure != nil {\n\t\tout.failure(lateFailure)\n\t}\n', name);
    return replaceOnce(out, '// exitOf is the exit code', 'var lateFailure error\n\n// exitOf is the exit code', name);
  }
  assert.ok(mutations[name], `unknown wrong implementation ${name}`);
  const [from, to] = mutations[name];
  return replaceOnce(source, from, to, name);
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

// The built CLI run as `kogen-loop run --task -` with a task requiring subagents, in an empty directory and HOME.
function cli(mutation) {
  return scratch(dir => {
    const bin = path.join(dir, 'kogen-loop');
    const opts = mutation ? overlay(dir, {[main]: alteredMain(mutation)}) : [];
    const build = run('go', ['build', ...opts, '-o', bin, pkg]);
    assert.equal(build.status, 0, `go build ${pkg}: ${build.stdout}${build.stderr}`);
    const home = path.join(dir, 'home');
    fs.mkdirSync(home);
    const task = {protocol: 'kogen-loop/v1', root: dir, prompt: 'prompt', role: {provider: 'chatgpt'}, requires: ['subagents']};
    return run(bin, ['run', '--task', '-'], {cwd: dir, input: JSON.stringify(task), timeout: 10000, env: {PATH: process.env.PATH, HOME: home}});
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

function checkRefusal(result) {
  assert.equal(result.status, 2, `refusal: CLI process exit ${result.status}: ${result.stdout}${result.stderr}`);
  const list = events(result, 'refusal');
  const types = list.map(event => event.type);
  assert.ok(!types.includes('session.started'), `refusal: a session started: ${types.join(', ')}`);
  const error = list.find(event => event.type === 'error');
  assert.ok(error, `refusal: no error event among ${types.join(', ')}`);
  assert.deepEqual([error.class, error.reason], ['loop', 'unsupported_capability'], 'refusal: error class and reason');
  assert.ok(typeof error.detail === 'string' && error.detail.includes('"subagents"'), `refusal: detail ${JSON.stringify(error.detail)} does not name "subagents"`);
}

function checkOrder(result) {
  const list = events(result, 'order');
  assert.deepEqual(list.map(event => event.type), ['error', 'session.ended'], 'order: event sequence');
  const end = list[list.length - 1];
  assert.deepEqual([end.status, end.exit], ['failed', 2], 'order: session.ended status and exit');
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
  When(prefix + 'I run the built CLI with a task requiring subagents', {timeout: 60000}, function () {
    this.capabilityRun = cli();
  });
  Then(prefix + 'the CLI exits 2 with an unsupported_capability error naming subagents and no session.started event', function () {
    checkRefusal(this.capabilityRun);
  });
  Then(prefix + 'the CLI emits the error event and then session.ended as the final event', function () {
    checkOrder(this.capabilityRun);
  });
  When(prefix + 'I run the package tests as written and with each of these wrong implementations:', {timeout: 110000}, function (table) {
    this.capabilityCoverage = coverage(table.raw().map(row => row[0]));
  });
  Then(prefix + 'the original package tests pass and a test fails with each wrong implementation', function () {
    checkCoverage(this.capabilityCoverage);
  });
} else {
  // Observer controls use real subprocess output, not fabricated go test JSON.
  const controls = require('../../.kogen/intents/unsupported-required-capability-regression/controls.json');
  const good = process.argv[2] === 'good';
  assert.ok(good || process.argv[2] === 'bad', 'expected good or bad observer control');
  const testSource = good ? controls.correct.files[test] : controls.wrong.find(control => control.name === 'leaves the regression untested').files[test];
  const all = [...sessionMutations, ...orderMutations];
  if (good) {
    const original = cli();
    checkRefusal(original);
    checkOrder(original);
    checkCoverage(coverage(all, testSource));
  } else {
    assert.throws(() => checkCoverage(coverage(all, testSource)), {message: /^No regression test caught /});
    for (const name of sessionMutations) assert.throws(() => checkRefusal(cli(name)), {message: /^refusal:/});
    for (const name of orderMutations) assert.throws(() => checkOrder(cli(name)), {message: /^order:/});
  }
  console.log(good ? 'recognized the refusal, its event order, and every test-detected regression' : 'rejected wrong refusals, wrong event order, and uncaught regressions');
  if (!good) process.exitCode = 1;
}
