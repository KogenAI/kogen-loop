'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then} = require('@cucumber/cucumber');

// The existing acceptance collector: one generic tool call on a root, or one tool
// definition, printed as JSON. The Gherkin owns the expectations.
const DRIVER = 'features/steps/list_files_quoted_paths_driver.go';
let driverBinary;

function driver() {
  if (driverBinary) return driverBinary;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strd-driver-'));
  const bin = path.join(dir, 'driver');
  const r = spawnSync('go', ['build', '-o', bin, DRIVER], {encoding: 'utf8', timeout: 170000});
  assert.equal(r.status, 0, 'go build -o ' + bin + ' ' + DRIVER + ': ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + r.stdout + r.stderr);
  driverBinary = bin;
  return bin;
}

// Git and the tools see a private HOME and no system or global Git configuration.
function hermetic(home) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  return Object.assign(env, {HOME: home, XDG_CONFIG_HOME: path.join(home, '.config'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: path.join(home, 'gitconfig')});
}

function git(world, ...args) {
  const r = spawnSync('git', args, {cwd: world.sd.root, env: hermetic(world.sd.home), encoding: 'utf8', timeout: 60000});
  assert.equal(r.status, 0, 'git ' + args.join(' ') + ': ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + r.stdout + r.stderr);
}

function call(world, input) {
  const env = world.sd ? hermetic(world.sd.home) : process.env;
  const r = spawnSync(driver(), [], {input: JSON.stringify(input), env, encoding: 'utf8', timeout: 120000});
  const context = 'driver ' + JSON.stringify(input) + ': ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + r.stdout + r.stderr;
  assert.ok(!r.error, context);
  assert.equal(r.status, 0, context);
  return JSON.parse(r.stdout);
}

function description(world) {
  const res = call(world, {definition: 'search_text'});
  assert.equal(typeof res.description, 'string', 'search_text has no string description: ' + JSON.stringify(res));
  return res.description;
}

Given('a fresh Git repository for the search dialect', function() {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'strd-')));
  const home = path.join(base, 'home');
  const root = path.join(base, 'repo');
  fs.mkdirSync(home);
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(home, 'gitconfig'), '');
  this.sd = {home, root};
  git(this, 'init', '-q');
});

Given('the search repository has a file {string} whose JSON-encoded content is:', function(name, doc) {
  const file = path.join(this.sd.root, name);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.parse(doc));
});

Given('the search repository commits all its files', function() {
  git(this, 'add', '-A');
  git(this, '-c', 'user.name=Acceptance', '-c', 'user.email=acceptance@example.invalid', 'commit', '-q', '-m', 'fixture');
});

When('search_text is called with the JSON arguments:', {timeout: 200000}, function(doc) {
  const args = JSON.parse(doc);
  const res = call(this, {root: this.sd.root, tool: 'search_text', args});
  assert.equal(res.error, undefined, 'search_text with ' + JSON.stringify(args) + ' returned a Go error: ' + res.error);
  this.sd.last = {args, text: res.text};
});

Then('the search result is exactly the JSON string:', function(doc) {
  const last = this.sd.last;
  assert.ok(last, 'search_text was not called');
  assert.equal(last.text, JSON.parse(doc), 'search_text with ' + JSON.stringify(last.args) + ' returned ' + JSON.stringify(last.text));
});

Then('the search_text description contains the JSON string:', {timeout: 200000}, function(doc) {
  const want = JSON.parse(doc);
  const got = description(this);
  assert.ok(got.includes(want), 'search_text description ' + JSON.stringify(got) + ' lacks ' + JSON.stringify(want));
});

Then('the search_text description does not contain {string}', {timeout: 200000}, function(text) {
  const got = description(this);
  assert.ok(!got.includes(text), 'search_text description ' + JSON.stringify(got) + ' still contains ' + JSON.stringify(text));
});
