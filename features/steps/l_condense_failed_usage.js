'use strict';
// L-CONDENSE-FAILED-USAGE: a failed history condensation discloses the summarization requests
// it sent and their summed usage. Two independent harnesses observe it:
// - loop.Direct through the public API (l_condense_failed_usage_driver.go, built with go build), over a
//   local fake ChatGPT Responses server, with an over-budget history passed in directly;
// - the real kogen-loop CLI against a local fake ChatGPT server (KOGEN_PROVIDER_URL and
//   KOGEN_AUTH_URL), whose history grows past the input window by large call arguments.
// Each builds one JSON observation; the Gherkin expectation is matched by
// l_condense_failed_usage_match.js.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');
const {When, Then, AfterAll} = require('@cucumber/cucumber');
const {check} = require('./l_condense_failed_usage_match.js');

const DRIVER = path.join('features', 'steps', 'l_condense_failed_usage_driver.go');

// built compiles source (a package path or one Go file) once into a temporary directory and
// returns the binary's path.
let binDir;
const binaries = {};
function built(name, source) {
  if (binaries[name]) return binaries[name];
  if (!binDir) binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-condense-failed-usage-bin-'));
  const out = path.join(binDir, name);
  const b = spawnSync('go', ['build', '-o', out, source], {encoding: 'utf8', timeout: 240000});
  assert.equal(b.status, 0, 'go build ' + source + ' failed: ' + b.stdout + b.stderr + (b.error || ''));
  return (binaries[name] = out);
}
function cli() { return built('kogen-loop', './cmd/kogen-loop'); }
AfterAll(function () {
  if (binDir) fs.rmSync(binDir, {recursive: true, force: true});
  binDir = undefined;
  for (const k of Object.keys(binaries)) delete binaries[k];
});

When('loop.Direct sends an over-budget history whose summarization requests are answered:', {timeout: 300000}, function (doc) {
  const driver = built('driver', './' + DRIVER);
  const r = spawnSync(driver, [], {input: doc, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024});
  assert.equal(r.status, 0, DRIVER + ' failed (status ' + r.status + '): ' + r.stdout + r.stderr + (r.error || ''));
  this.lcfuObservation = JSON.parse(r.stdout);
});

// The fixture is {"reads": n, "pad": bytes, "summaries": [answer...]}. The first n conversation
// requests are answered with one read_file call of notes.txt whose arguments also carry pad
// filler bytes; later ones with a finish call. A request without tools is a summarization
// request and takes the next answer: {"text": t, "usage": u} or {"status": s} (a JSON error).
// The observation keeps the exit code, the requests the fake saw and, in order, every
// context.condensed, error, round.ended and session.ended event without protocol, seq and time.
async function runCLI(spec) {
  const bin = cli();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-condense-failed-usage-'));
  const faults = [];
  let summaries = 0, conversation = 0;
  let child, server, guard, stdout = '', stderr = '', timedOut = false;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'notes.txt'), 'FACT-001 noted\n');
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive: true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600}));
    server = http.createServer(async (req, res) => {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        assert.equal(req.method + ' ' + req.url, 'POST /v1/responses');
        const body = JSON.parse(raw);
        let item, usage;
        if (!Array.isArray(body.tools) || body.tools.length === 0) {
          const answer = spec.summaries[summaries++];
          assert.ok(answer, 'summarization request ' + summaries + ' has no scripted answer');
          if (answer.status) {
            res.writeHead(answer.status, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({error: {message: 'fixture failure', code: 'invalid_request_error'}}));
            return;
          }
          item = {type: 'message', role: 'assistant', content: [{type: 'output_text', text: answer.text}]};
          usage = answer.usage;
        } else {
          conversation++;
          item = conversation <= spec.reads
            ? {type: 'function_call', call_id: 'call-' + conversation, name: 'read_file', arguments: JSON.stringify({path: 'notes.txt', pad: 'x'.repeat(spec.pad)})}
            : {type: 'function_call', call_id: 'fin', name: 'finish', arguments: JSON.stringify({summary: 'model claim'})};
        }
        const response = {status: 'completed'};
        if (usage) response.usage = usage;
        res.writeHead(200, {'Content-Type': 'text/event-stream'});
        res.write('data: ' + JSON.stringify({type: 'response.output_item.done', output_index: 0, item}) + '\n\n');
        res.end('data: ' + JSON.stringify({type: 'response.completed', response}) + '\n\n');
      } catch (e) {
        faults.push(e.message);
        if (!res.headersSent) res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: {message: 'fixture fault'}}));
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const task = {protocol: 'kogen-loop/v1', root, role: {provider: 'chatgpt', model: 'fixture-model', effort: 'medium', base_url: ''}, instructions: '', prompt: 'TASK: read notes.txt', tools: ['read_file'], protected: [], excluded: [], terminal: ['finish'], deadline_seconds: 0, session: {dir: '', resume: false}, requires: []};
    child = spawn(bin, ['run', '--task', '-'], {cwd: root, env: {HOME: home, TMPDIR: dir, PATH: process.env.PATH, KOGEN_PROVIDER_URL: origin, KOGEN_AUTH_URL: origin}});
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => { stderr += b; });
    child.stdin.on('error', () => {});
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code)); });
    child.stdin.end(JSON.stringify(task));
    guard = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 60000);
    const exit = await done;
    assert.equal(timedOut, false, 'the CLI did not end within the 60 s fixture guard: ' + stderr);
    const events = stdout.trim() === '' ? [] : stdout.trim().split('\n').map(l => JSON.parse(l));
    const kept = ['context.condensed', 'error', 'round.ended', 'session.ended'];
    return {
      exit,
      summary_requests: summaries,
      conversation_requests: conversation,
      faults,
      events: events.filter(e => kept.includes(e.type)).map(({protocol, seq, time, ...rest}) => rest),
    };
  } finally {
    clearTimeout(guard);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

When('the kogen-loop CLI grows its history past the input window with summarization answered:', {timeout: 360000}, async function (doc) {
  this.lcfuObservation = await runCLI(JSON.parse(doc));
});

Then('the condensation observation matches:', function (doc) {
  assert.ok(this.lcfuObservation, 'no condensation observation was made');
  check(this.lcfuObservation, JSON.parse(doc));
});
