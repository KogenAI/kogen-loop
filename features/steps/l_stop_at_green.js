'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

function goBuild(dir, args) {
  const out = path.join(dir, 'bin');
  const r = spawnSync('go', ['build', '-o', out, ...args], {encoding: 'utf8', timeout: 90000});
  assert.ifError(r.error);
  assert.equal(r.status, 0, 'go build ' + args.join(' ') + ' failed:\n' + r.stdout + r.stderr);
  return out;
}

// Prints loop.DefaultInstructions through a temporary consumer of the public package.
function readDefaultInstructions() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-stop-at-green-const-'));
  try {
    const source = path.join(dir, 'main.go');
    fs.writeFileSync(source, 'package main\nimport ("fmt"; "github.com/KogenAI/kogen-loop/loop")\nfunc main() { fmt.Print(loop.DefaultInstructions) }\n');
    const r = spawnSync(goBuild(dir, [source]), [], {encoding: 'utf8', timeout: 10000});
    assert.ifError(r.error);
    assert.equal(r.status, 0, 'default instructions consumer failed:\n' + r.stdout + r.stderr);
    return r.stdout;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// Runs the real CLI once with empty task instructions against a local fake ChatGPT
// Responses endpoint that answers every request with a finish call.
async function runFreshSession() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'l-stop-at-green-cli-'));
  const root = path.join(base, 'root'), home = path.join(base, 'home');
  for (const dir of [root, home]) fs.mkdirSync(dir, {mode: 0o700});
  const creds = path.join(home, '.kogen/credentials');
  fs.mkdirSync(creds, {recursive: true, mode: 0o700});
  fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600}), {mode: 0o600});
  const bodies = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    bodies.push({url: req.url, method: req.method, body});
    const item = {type: 'function_call', call_id: 'c1', name: 'finish', arguments: '{"summary":"done"}'};
    res.writeHead(200, {'content-type': 'text/event-stream', 'x-request-id': 'req-l-stop-at-green'});
    res.write('data: ' + JSON.stringify({type: 'response.output_item.done', output_index: 0, item}) + '\n\n');
    res.end('data: ' + JSON.stringify({type: 'response.completed', response: {status: 'completed', id: 'resp-1'}}) + '\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let child, timer;
  try {
    const binary = goBuild(base, ['./cmd/kogen-loop']);
    const task = {protocol: 'kogen-loop/v1', root, role: {provider: 'chatgpt', model: 'fixture-model', effort: 'medium', base_url: ''}, instructions: '', prompt: 'do the thing', tools: ['read_file', 'write_file', 'list_files', 'search_text', 'shell'], protected: [], excluded: [], terminal: [], deadline_seconds: 0, session: {dir: '', resume: false}, requires: []};
    const taskPath = path.join(base, 'task.json');
    fs.writeFileSync(taskPath, JSON.stringify(task));
    let stdout = '', stderr = '';
    child = spawn(binary, ['run', '--task', taskPath], {env: {HOME: home, TMPDIR: base, PATH: process.env.PATH, KOGEN_PROVIDER_URL: 'http://127.0.0.1:' + server.address().port}, stdio: ['ignore', 'pipe', 'pipe']});
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => { stderr += b; });
    const end = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({code, signal}));
      timer = setTimeout(() => child.kill('SIGKILL'), 15000);
    });
    return {exit: end.code, signal: end.signal, stdout, stderr, bodies};
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null) child.kill('SIGKILL');
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(base, {recursive: true, force: true});
  }
}

function occurrences(text, part) {
  let count = 0;
  for (let i = text.indexOf(part); i !== -1; i = text.indexOf(part, i + part.length)) count++;
  return count;
}

When('I read the L stop-at-green default instructions', {timeout: 110000}, function () {
  this.lStopAtGreenText = readDefaultInstructions();
});
Then('the L stop-at-green default instructions are exactly', function (expected) {
  assert.equal(this.lStopAtGreenText, expected);
});
Then('the L stop-at-green default instructions end with {string}', function (sentence) {
  assert.ok(this.lStopAtGreenText.endsWith(sentence), 'default instructions do not end with: ' + sentence + '\nactual: ' + this.lStopAtGreenText);
  assert.equal(occurrences(this.lStopAtGreenText, sentence), 1, 'sentence count in default instructions');
});

When('a fresh L stop-at-green CLI session runs with empty instructions', {timeout: 110000}, async function () {
  this.lStopAtGreenRun = await runFreshSession();
});
Then('the L stop-at-green session ended by its finish call after one request', function () {
  const r = this.lStopAtGreenRun;
  assert.equal(r.signal, null, 'CLI was killed:\n' + r.stderr);
  assert.equal(r.exit, 0, 'CLI exit:\n' + r.stdout + r.stderr);
  const events = r.stdout.trimEnd().split('\n').map(line => JSON.parse(line));
  assert.equal(events.at(-1).type, 'session.ended', 'last event');
  assert.equal(events.at(-1).exit, 0, 'session.ended exit');
  assert.deepEqual(r.bodies.map(b => [b.method, b.url]), [['POST', '/v1/responses']]);
});
Then('the L stop-at-green request instructions are exactly', function (expected) {
  assert.equal(JSON.parse(this.lStopAtGreenRun.bodies[0].body).instructions, expected);
});
Then('the L stop-at-green request body contains {string} exactly once', function (sentence) {
  assert.equal(occurrences(this.lStopAtGreenRun.bodies[0].body, sentence), 1, 'occurrences of "' + sentence + '" in the request body');
});
