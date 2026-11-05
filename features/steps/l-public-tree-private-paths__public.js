'use strict';
// Steps for the l-public-tree-private-paths Intent: run the landed l-public-ready
// acceptance feature through the real Cucumber runner and inspect the
// l-consumes-contract Intent record.
const {Given, When, Then} = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const P = 'l-public-tree-private-paths: ';
// The residue patterns of features/steps/l_public_ready.js, split the same way so
// this file holds no literal residue.
const RESIDUES = [
  new RegExp('/' + '(?:Users|home)/[^\\s`"<>]+', 'i'),
  new RegExp('~/' + 'work\\.noindex/'),
  new RegExp('kogen-' + '(?:runner|macbook-runner|linux-macbook|bench-eu2)', 'i'),
  new RegExp('almir' + 'sarajcic', 'i'),
  new RegExp('GOPR' + 'IVATE|instead' + 'Of'),
  /contributions? (?:are |is )?not (?:accepted|welcome)/i
];

const sha256 = file => fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : 'missing';

Given(P + 'these files have these sha256 digests:', function (table) {
  const expected = table.hashes();
  assert.deepEqual(expected.map(r => ({file:r.file, sha256:sha256(r.file)})), expected, 'file digests differ');
});

When(P + 'I run the acceptance feature {string} with only the step file {string}', {timeout:180000}, function (feature, step) {
  assert.ok(process.env.KOGEN_CUCUMBER, 'KOGEN_CUCUMBER is not set, so the Cucumber runner cannot be located');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-public-tree-private-paths-'));
  const out = path.join(dir, 'messages.ndjson');
  const args = [path.join(process.env.KOGEN_CUCUMBER, '@cucumber/cucumber/bin/cucumber.js'), '--strict', '--require', step, '--format', 'message:' + out, feature];
  const r = spawnSync(process.env.KOGEN_NODE || process.execPath, args,
    {env:{...process.env, NODE_PATH:process.env.KOGEN_CUCUMBER}, encoding:'utf8', timeout:150000, maxBuffer:16 * 1024 * 1024});
  const messages = fs.existsSync(out) ? fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
  fs.rmSync(dir, {recursive:true, force:true});
  this.publicRun = {command:'cucumber ' + args.slice(1).join(' '), status:r.status, signal:r.signal,
    error:r.error ? r.error.message : '', output:(r.stdout || '') + (r.stderr || ''), messages};
});

const describeRun = run => `${run.command}\nexit ${run.status} signal ${run.signal} ${run.error}\n${run.output}`;

Then(P + 'that run reports these scenario results:', function (table) {
  const run = this.publicRun;
  assert.ok(run, 'the acceptance feature was not run');
  const pickles = new Map(), cases = new Map(), started = new Map();
  for (const e of run.messages) {
    if (e.pickle) pickles.set(e.pickle.id, e.pickle.name);
    if (e.testCase) cases.set(e.testCase.id, e.testCase.pickleId);
    if (e.testCaseStarted) started.set(e.testCaseStarted.id, {scenario:pickles.get(cases.get(e.testCaseStarted.testCaseId)), statuses:[], messages:[]});
    if (e.testStepFinished) {
      const s = started.get(e.testStepFinished.testCaseStartedId);
      const result = e.testStepFinished.testStepResult;
      s.statuses.push(result.status);
      if (result.message) s.messages.push(result.message.split('\n')[0]);
    }
  }
  const actual = [...started.values()].map(s => ({scenario:s.scenario, steps:String(s.statuses.length),
    result:s.statuses.length > 0 && s.statuses.every(x => x === 'PASSED') ? 'passed' : `failed: ${s.statuses.join(',')} ${s.messages.join(' | ')}`}));
  assert.deepEqual(actual, table.hashes(), 'scenario results differ from the expected ones\n' + describeRun(run));
});

Then(P + 'that run exits with status {int}', function (status) {
  const run = this.publicRun;
  assert.ok(run, 'the acceptance feature was not run');
  assert.equal(run.status, status, describeRun(run));
});

Then(P + '{string} has exactly one line starting with {string}, and that line is:', function (file, prefix, doc) {
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.startsWith(prefix));
  assert.deepEqual(lines, [doc], `${file}: lines starting with ${JSON.stringify(prefix)}`);
});

Then(P + '{string} has no home path, runner host or personal name', function (file) {
  const text = fs.readFileSync(file, 'utf8');
  assert.deepEqual(RESIDUES.filter(p => p.test(text)).map(String), [], `${file}: private documentation residues`);
});
