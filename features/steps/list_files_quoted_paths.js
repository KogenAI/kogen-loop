'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then} = require('@cucumber/cucumber');

const DRIVER = 'features/steps/list_files_quoted_paths_driver.go';
let driverBinary;

function driver() {
  if (driverBinary) return driverBinary;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lfqp-driver-'));
  const bin = path.join(dir, 'driver');
  const r = spawnSync('go', ['build', '-o', bin, DRIVER], {encoding: 'utf8', timeout: 170000});
  assert.equal(r.status, 0, 'go build -o ' + bin + ' ' + DRIVER + ': ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + r.stdout + r.stderr);
  driverBinary = bin;
  return bin;
}

// Git and the tools see a private HOME and no system or global Git configuration, so a
// core.quotePath setting of the machine cannot decide the result.
function hermetic(home) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return Object.assign(env, {HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(home, 'gitconfig')});
}

function git(world, ...args) {
  const r = spawnSync('git', args, {cwd: world.qp.root, env: hermetic(world.qp.home), encoding: 'utf8', timeout: 60000});
  assert.equal(r.status, 0, 'git ' + args.join(' ') + ': ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + r.stdout + r.stderr);
}

function call(world, input) {
  const env = world.qp ? hermetic(world.qp.home) : process.env;
  const r = spawnSync(driver(), [], {input: JSON.stringify(input), env, encoding: 'utf8', timeout: 120000});
  const context = 'driver ' + JSON.stringify(input) + ': ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + r.stdout + r.stderr;
  assert.ok(!r.error, context);
  assert.equal(r.status, 0, context);
  return JSON.parse(r.stdout);
}

function run(world, tool, args) {
  const res = call(world, {root: world.qp.root, tool, args});
  assert.equal(res.error, undefined, tool + ' returned a Go error: ' + res.error);
  world.qp.last = {tool, args, text: res.text};
  if (tool === 'list_files') world.qp.listing = res.text;
}

function shown(world) {
  return JSON.stringify(world.qp.last.tool) + ' with ' + JSON.stringify(world.qp.last.args) + ' returned ' + JSON.stringify(world.qp.last.text);
}

function listedLine(world, n) {
  assert.ok(world.qp.listing !== undefined, 'no list_files result to take a line from');
  const lines = world.qp.listing.split('\n');
  assert.ok(n >= 1 && n <= lines.length, 'list_files result ' + JSON.stringify(world.qp.listing) + ' has no line ' + n);
  return lines[n - 1];
}

Given('a fresh Git repository for path printing', function() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lfqp-')));
  const home = path.join(base, 'home');
  const root = path.join(base, 'repo');
  fs.mkdirSync(home);
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(home, 'gitconfig'), '');
  this.qp = {home, root};
  git(this, 'init', '-q');
});

Given('the repository has a file {string} containing {string}', function(name, content) {
  fs.writeFileSync(path.join(this.qp.root, name), content + '\n');
});

Given('the repository has a file containing {string} whose JSON-encoded name is:', function(content, doc) {
  const file = path.join(this.qp.root, JSON.parse(doc));
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, content + '\n');
});

Given('the repository commits all its files', function() {
  git(this, 'add', '-A');
  git(this, '-c', 'user.name=Acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '-q', '-m', 'fixture');
});

When('the model calls {string} with no arguments', {timeout: 200000}, function(tool) {
  run(this, tool, {});
});

When('the model calls {string} with arguments:', {timeout: 200000}, function(tool, doc) {
  run(this, tool, JSON.parse(doc));
});

When('the model calls read_file with line {int} of the list_files result as the path', {timeout: 200000}, function(n) {
  run(this, 'read_file', {path: listedLine(this, n)});
});

When('the model calls read_file with the decoded line {int} of the list_files result as the path', {timeout: 200000}, function(n) {
  const line = listedLine(this, n);
  assert.ok(line.startsWith('"'), 'line ' + n + ' of list_files result ' + JSON.stringify(this.qp.listing) + ' is not a quoted form');
  run(this, 'read_file', {path: JSON.parse(line)});
});

Then('the tool result is exactly:', function(doc) {
  assert.equal(this.qp.last.text, doc, shown(this));
});

Then('the tool result is exactly, with {string} standing for one backslash:', function(mark, doc) {
  assert.equal(this.qp.last.text, doc.split(mark).join(String.fromCharCode(92)), shown(this));
});

Then('the tool result lines, sorted, are exactly:', function(doc) {
  assert.deepEqual(this.qp.last.text.split('\n').sort(), doc.split('\n'), shown(this));
});

Then('the read_file result is line 1 holding {string}', function(text) {
  assert.equal(this.qp.last.text, '1\t' + text, shown(this));
});

Then('the {string} tool description contains:', {timeout: 200000}, function(tool, doc) {
  const res = call(this, {definition: tool});
  assert.ok(typeof res.description === 'string' && res.description.includes(doc), tool + ' description ' + JSON.stringify(res.description) + ' lacks ' + JSON.stringify(doc));
});
