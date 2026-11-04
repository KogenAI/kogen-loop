'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then} = require('@cucumber/cucumber');

const repo = process.cwd();
const modulePath = 'github.com/KogenAI/kogen-loop';
const buildCmd = 'go build -o <tmp>/slowtests scripts/slowtests.go';
let built = null;

function outcome(r) {
  return r.error ? 'error ' + r.error.message : r.signal ? 'signal ' + r.signal : 'exit ' + r.status;
}

function shq(s) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

function buildReport() {
  if (built) return built;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-slow-test-budget-report-bin-'));
  const bin = path.join(dir, 'slowtests');
  const r = spawnSync('go', ['build', '-o', bin, 'scripts/slowtests.go'], {cwd: repo, encoding: 'utf8', timeout: 110000});
  built = {bin, ok: !r.error && r.status === 0,
    detail: '`' + buildCmd + '` in ' + repo + ' ended with ' + outcome(r) + ':\n' + (r.stdout || '') + (r.stderr || '')};
  return built;
}

function synth(world) {
  assert.ok(world.lstb, 'no synthetic module was created before this step');
  return world.lstb;
}

function report(world) {
  const s = synth(world);
  assert.ok(s.run, 'the slow-test report was not run');
  return s.run;
}

function context(r) {
  return '\nslowtests ' + r.args.join(' ') + ' in ' + r.cwd + ' ended with ' + outcome(r) +
    '\n--- stdout ---\n' + (r.stdout || '') + '--- stderr ---\n' + (r.stderr || '');
}

function goCalls(s) {
  if (!fs.existsSync(s.goLog)) return [];
  return fs.readFileSync(s.goLog, 'utf8').split('---\n').slice(1).map(block => block.replace(/\n$/, '').split('\n'));
}

function docLines(doc) {
  return doc.split('\n').filter(line => line.trim() !== '');
}

function parseAllowlist(text, file) {
  const entries = [];
  text.split('\n').forEach((raw, i) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const hash = line.indexOf('#');
    assert.ok(hash > 0, file + ':' + (i + 1) + ': entry has no "# <reason>": ' + raw);
    const fields = line.slice(0, hash).trim().split(/\s+/);
    const reason = line.slice(hash + 1).trim();
    assert.equal(fields.length, 2, file + ':' + (i + 1) + ': entry is not "<import path> <TestName> # <reason>": ' + raw);
    assert.ok(reason !== '', file + ':' + (i + 1) + ': entry has an empty reason: ' + raw);
    entries.push({line: i + 1, pkg: fields[0], test: fields[1], reason});
  });
  return entries;
}

Given('l-slow-test-budget-report: a synthetic Go module {string}', function (name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-slow-test-budget-report-mod-'));
  fs.writeFileSync(path.join(dir, 'go.mod'), 'module ' + name + '\n\ngo 1.21\n');
  const shimDir = path.join(dir, '.shim');
  fs.mkdirSync(shimDir);
  const which = spawnSync('sh', ['-c', 'command -v go'], {encoding: 'utf8'});
  const realGo = (which.stdout || '').trim();
  assert.ok(which.status === 0 && realGo !== '', 'go is not on PATH: ' + outcome(which) + ' ' + (which.stderr || ''));
  const goLog = path.join(shimDir, 'go-calls.log');
  fs.writeFileSync(path.join(shimDir, 'go'),
    '#!/bin/sh\n{ echo ---; for a in "$@"; do printf \'%s\\n\' "$a"; done; } >> ' + shq(goLog) + '\nexec ' + shq(realGo) + ' "$@"\n',
    {mode: 0o755});
  this.lstb = {dir, shimDir, goLog, run: null};
});

Given('l-slow-test-budget-report: the synthetic module file {string} contains:', function (rel, body) {
  const s = synth(this);
  const file = path.join(s.dir, rel);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, body + '\n');
});

function runReport(world, args) {
  const s = synth(world);
  const b = buildReport();
  assert.ok(b.ok, 'the slow-test report script could not be built: ' + b.detail);
  const env = Object.assign({}, process.env, {PATH: s.shimDir + path.delimiter + (process.env.PATH || '')});
  const r = spawnSync(b.bin, args, {cwd: s.dir, env, encoding: 'utf8', timeout: 170000, maxBuffer: 16 * 1024 * 1024});
  s.run = {args, cwd: s.dir, status: r.status, signal: r.signal, error: r.error, stdout: r.stdout || '', stderr: r.stderr || ''};
  assert.ok(!r.error, 'the slow-test report did not finish:' + context(s.run));
}

When('l-slow-test-budget-report: I run the slow-test report', {timeout: 300000}, function () {
  runReport(this, []);
});

When('l-slow-test-budget-report: I run the slow-test report with the arguments {string}', {timeout: 300000}, function (args) {
  runReport(this, args.split(' ').filter(Boolean));
});

Then('l-slow-test-budget-report: the report exits with status {int}', function (status) {
  const r = report(this);
  assert.equal(r.status, status, 'wrong exit status:' + context(r));
});

Then('l-slow-test-budget-report: the report output lines match these patterns in order:', function (doc) {
  const r = report(this);
  const patterns = docLines(doc);
  const lines = r.stdout.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  assert.equal(lines.length, patterns.length,
    'expected ' + patterns.length + ' output lines, got ' + lines.length + ':' + context(r));
  patterns.forEach((p, i) => {
    assert.match(lines[i], new RegExp('^(?:' + p + ')$'), 'output line ' + (i + 1) + ' does not match /' + p + '/:' + context(r));
  });
});

Then('l-slow-test-budget-report: the report output does not contain {string}', function (text) {
  const r = report(this);
  assert.ok(!r.stdout.includes(text) && !r.stderr.includes(text), 'the report printed ' + JSON.stringify(text) + ':' + context(r));
});

Then('l-slow-test-budget-report: the report standard output is empty', function () {
  const r = report(this);
  assert.equal(r.stdout, '', 'standard output is not empty:' + context(r));
});

Then('l-slow-test-budget-report: the report standard error is empty', function () {
  const r = report(this);
  assert.equal(r.stderr, '', 'standard error is not empty:' + context(r));
});

Then('l-slow-test-budget-report: the report standard error contains {string}', function (text) {
  const r = report(this);
  assert.ok(r.stderr.includes(text), 'standard error lacks ' + JSON.stringify(text) + ':' + context(r));
});

Then('l-slow-test-budget-report: the report ran go once with exactly these arguments:', function (doc) {
  const s = synth(this);
  const r = report(this);
  const calls = goCalls(s);
  assert.equal(calls.length, 1, 'expected exactly one go invocation from PATH, got ' + JSON.stringify(calls) + ':' + context(r));
  assert.deepEqual(calls[0], docLines(doc), 'go was run with different arguments:' + context(r));
});

Then('l-slow-test-budget-report: the report did not run go', function () {
  const s = synth(this);
  const r = report(this);
  assert.deepEqual(goCalls(s), [], 'go was run although the report should stop first:' + context(r));
});

Then('l-slow-test-budget-report: the repository allowlist {string} starts with a comment line', function (rel) {
  const file = path.join(repo, rel);
  assert.ok(fs.existsSync(file), rel + ' does not exist in the repository');
  const first = fs.readFileSync(file, 'utf8').split('\n').find(line => line.trim() !== '');
  assert.ok(first !== undefined && first.trim().startsWith('#'), rel + ' does not start with a comment line: ' + JSON.stringify(first));
});

Then('l-slow-test-budget-report: the repository allowlist {string} has {int} or more entries, each naming an existing test function of its package with a reason starting with {string}, {string} or {string}',
  function (rel, min, r1, r2, r3) {
    const file = path.join(repo, rel);
    assert.ok(fs.existsSync(file), rel + ' does not exist in the repository');
    const entries = parseAllowlist(fs.readFileSync(file, 'utf8'), rel);
    assert.ok(entries.length >= min, rel + ' has ' + entries.length + ' entries, expected ' + min + ' or more');
    for (const e of entries) {
      const where = rel + ':' + e.line + ': ' + e.pkg + ' ' + e.test;
      assert.ok([r1, r2, r3].some(prefix => e.reason.startsWith(prefix)),
        where + ': reason does not start with ' + [r1, r2, r3].map(x => JSON.stringify(x)).join(', ') + ': ' + JSON.stringify(e.reason));
      assert.match(e.test, /^Test[A-Za-z0-9_]*$/, where + ': not a top-level test name');
      let dir;
      if (e.pkg === modulePath) dir = repo;
      else {
        assert.ok(e.pkg.startsWith(modulePath + '/'), where + ': package is not in module ' + modulePath);
        dir = path.join(repo, e.pkg.slice(modulePath.length + 1));
      }
      assert.ok(fs.existsSync(dir) && fs.statSync(dir).isDirectory(), where + ': package directory ' + dir + ' does not exist');
      const decl = new RegExp('^func ' + e.test + '\\(\\w+ \\*testing\\.T\\)', 'm');
      const found = fs.readdirSync(dir).filter(f => f.endsWith('_test.go'))
        .some(f => decl.test(fs.readFileSync(path.join(dir, f), 'utf8')));
      assert.ok(found, where + ': no func ' + e.test + '(t *testing.T) in ' + dir + '/*_test.go');
    }
  });

Then('l-slow-test-budget-report: go list in the repository lists no package under {string}', {timeout: 120000}, function (prefix) {
  const r = spawnSync('go', ['list', './...'], {cwd: repo, encoding: 'utf8', timeout: 110000});
  const detail = '`go list ./...` ended with ' + outcome(r) + ':\n' + (r.stdout || '') + (r.stderr || '');
  assert.ok(!r.error && r.status === 0, detail);
  const under = (r.stdout || '').split('\n').filter(p => p === modulePath + '/' + prefix || p.startsWith(modulePath + '/' + prefix + '/'));
  assert.deepEqual(under, [], 'go list ./... includes ' + prefix + ': ' + detail);
});

Then('l-slow-test-budget-report: the repository README.md contains {string}', function (text) {
  assert.ok(fs.readFileSync(path.join(repo, 'README.md'), 'utf8').includes(text), 'README.md lacks: ' + text);
});
