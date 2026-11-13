'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

const root = process.cwd();
let tmp, bin, result, matches;

function scratch() {
  if (!tmp) tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slopc-'));
  return tmp;
}

function build() {
  if (bin) return bin;
  const out = path.join(scratch(), 'kogen-loop');
  const r = spawnSync('go', ['build', '-o', out, './cmd/kogen-loop'], {cwd: root, encoding: 'utf8'});
  assert.equal(r.status, 0, 'go build failed: ' + r.stdout + r.stderr);
  bin = out;
  return bin;
}

When('simplify-loop-obsolete-provider-cache: the built CLI runs a task with provider {string}', function (name) {
  const home = fs.mkdtempSync(path.join(scratch(), 'home-'));
  const work = fs.mkdtempSync(path.join(scratch(), 'root-'));
  const task = {
    protocol: 'kogen-loop' + '/v1', root: work,
    role: {provider: name, model: 'm', effort: 'e', base_url: ''},
    instructions: '', prompt: 'do the thing', tools: ['read_file'], protected: [], excluded: [],
    terminal: ['finish'], deadline_seconds: 0, session: {dir: '', resume: false}, requires: [],
  };
  const r = spawnSync(build(), ['run', '--task', '-'], {
    input: JSON.stringify(task), encoding: 'utf8', timeout: 60000,
    env: {PATH: process.env.PATH, HOME: home},
  });
  result = {status: r.status, out: (r.stdout || '') + (r.stderr || '')};
});

Then('simplify-loop-obsolete-provider-cache: the CLI refuses with exit {int} and {string}', function (code, text) {
  assert.equal(result.status, code, 'exit status; output: ' + result.out);
  assert.ok(result.out.includes(text), 'output lacks ' + text + ': ' + result.out);
  assert.ok(!/"provider"\s*:\s*"chatgpt"/.test(result.out), 'a chatgpt route was selected: ' + result.out);
});

When('simplify-loop-obsolete-provider-cache: the repository is searched for obsolete provider and cache wording', function () {
  const r = spawnSync('grep', ['-rniE', 'legacy|older checkpoints', 'provider', 'cmd', 'README.md', 'CHANGELOG.md', 'docs/contract'],
    {cwd: root, encoding: 'utf8'});
  assert.ok(r.status === 0 || r.status === 1, 'grep failed: ' + r.stderr);
  matches = r.stdout.trim();
});

Then('simplify-loop-obsolete-provider-cache: the search finds no match', function () {
  assert.equal(matches, '', 'obsolete wording found:\n' + matches);
});
