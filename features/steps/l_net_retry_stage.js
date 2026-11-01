'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const {spawn, spawnSync} = require('node:child_process');

// The real CLI against a local fake Responses server (KOGEN_PROVIDER_URL) that can stop accepting
// connections. A script is {"answers": [...], "outage_after_request": n, "outage_seconds": s,
// "tools": [...], "deadline_seconds": d}:
// - answers: one per HTTP request, in order: {"status":200,"text":T} (an assistant message),
//   {"status":200,"call":{"id":I,"name":N,"arguments":{...}}} (one function call) or a non-200
//   {"status":S,"message":M,"type":T,"code":C,"retry_after":R} with the JSON body {"error":{...}}.
// - outage_after_request: 0 refuses connections from the start; n > 0 closes the listener while
//   answering request n (that answer carries Connection: close, so no kept-alive connection remains).
// - outage_seconds: the listener opens again (same port) that many seconds after the CLI's first
//   failed request.attempt event; null never opens it again. Without outage_after_request the
//   provider accepts connections throughout.
let binDir, binary;
function cli() {
  if (binary) return binary;
  binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-net-retry-stage-bin-'));
  const out = path.join(binDir, 'kogen-loop');
  const b = spawnSync('go', ['build', '-o', out, './cmd/kogen-loop'], {encoding: 'utf8', timeout: 120000});
  assert.equal(b.status, 0, 'go build ./cmd/kogen-loop failed: ' + b.stdout + b.stderr + (b.error || ''));
  return (binary = out);
}
function cleanup() { if (binDir) fs.rmSync(binDir, {recursive: true, force: true}); binDir = binary = undefined; }

function sse(res, answer, close) {
  const headers = {'Content-Type': 'text/event-stream'};
  if (close) headers.Connection = 'close';
  res.writeHead(200, headers);
  let item;
  if (answer.call) item = {type: 'function_call', id: 'fc_' + answer.call.id, call_id: answer.call.id, name: answer.call.name, arguments: JSON.stringify(answer.call.arguments)};
  else item = {type: 'message', role: 'assistant', content: [{type: 'output_text', text: answer.text}]};
  res.write('data: ' + JSON.stringify({type: 'response.output_item.done', output_index: 0, item}) + '\n\n');
  res.end('data: ' + JSON.stringify({type: 'response.completed', response: {status: 'completed'}}) + '\n\n');
}

async function exercise(script) {
  const bin = cli();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-net-retry-stage-'));
  const requests = [], faults = [], servers = [];
  const outage = Object.hasOwn(script, 'outage_after_request');
  let child, guard, reopen, opened = null, stdout = '', stderr = '', timedOut = false, failedSeen = false;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive: true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600}));
    const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
    const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
    let current;
    const handler = async (req, res) => {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const at = performance.now();
        assert.equal(req.method + ' ' + req.url, 'POST /v1/responses');
        const body = JSON.parse(raw);
        const answer = script.answers[requests.length];
        requests.push({at, body});
        assert.ok(answer, 'unexpected request ' + requests.length + ': the script has ' + script.answers.length + ' answers');
        const close = outage && script.outage_after_request === requests.length;
        if (close) current.close();
        if (answer.status === 200) { sse(res, answer, close); return; }
        const headers = {'Content-Type': 'application/json'};
        if (close) headers.Connection = 'close';
        if (answer.retry_after !== undefined) headers['Retry-After'] = answer.retry_after;
        const error = {message: answer.message};
        if (answer.type !== undefined) error.type = answer.type;
        if (answer.code !== undefined) error.code = answer.code;
        res.writeHead(answer.status, headers);
        res.end(JSON.stringify({error}));
      } catch (e) {
        faults.push(e.message);
        if (!res.headersSent) res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: {message: 'fixture fault'}}));
      }
    };
    const listen = async () => {
      current = http.createServer(handler); servers.push(current);
      await new Promise((resolve, reject) => { current.once('error', reject); current.listen(port, '127.0.0.1', resolve); });
    };
    if (!outage || script.outage_after_request > 0) await listen();
    const task = {protocol: 'kogen-loop/v1', root, role: {provider: 'chatgpt', model: 'fixture-model', effort: 'medium', base_url: ''}, instructions: '', prompt: 'fixture task', tools: script.tools || [], protected: [], excluded: [], terminal: [], deadline_seconds: script.deadline_seconds || 0, session: {dir: '', resume: false}, requires: []};
    child = spawn(bin, ['run', '--task', '-'], {cwd: root, env: {HOME: home, TMPDIR: dir, PATH: process.env.PATH, KOGEN_PROVIDER_URL: 'http://127.0.0.1:' + port}});
    let pending = '';
    child.stdout.on('data', b => {
      stdout += b; pending += b;
      const lines = pending.split('\n'); pending = lines.pop();
      for (const line of lines) {
        let e; try { e = JSON.parse(line); } catch (_) { continue; }
        if (e.type === 'request.attempt' && e.record && e.record.outcome === 'failed' && !failedSeen) {
          failedSeen = true;
          if (outage && typeof script.outage_seconds === 'number') {
            reopen = setTimeout(() => { listen().then(() => { opened = performance.now(); }, err => faults.push('reopen: ' + err.message)); }, script.outage_seconds * 1000);
          }
        }
      }
    });
    child.stderr.on('data', b => { stderr += b; });
    child.stdin.on('error', () => {});
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({code, signal, at: performance.now()})); });
    child.stdin.end(JSON.stringify(task));
    guard = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 60000);
    const end = await done;
    assert.equal(timedOut, false, 'the CLI did not end within the 60 s fixture guard: ' + stderr);
    assert.deepEqual(faults, [], 'fake provider faults');
    const events = stdout.trim() === '' ? [] : stdout.trim().split('\n').map(l => JSON.parse(l));
    const error = events.find(e => e.type === 'error');
    const round = events.find(e => e.type === 'round.ended');
    const files = {};
    for (const name of fs.readdirSync(root)) {
      const p = path.join(root, name);
      if (fs.statSync(p).isFile()) files[name] = fs.readFileSync(p, 'utf8');
    }
    return {
      exit: end.code,
      error: error ? {class: error.class, reason: error.reason, detail: error.detail} : null,
      attempts: events.filter(e => e.type === 'request.attempt').map(e => ({outcome: e.record.outcome, end_reason: e.record.end_reason})),
      requests: requests.length,
      inputs: requests.map(r => r.body.input),
      after_open: requests.map(r => (opened === null || r.at < opened ? null : (r.at - opened) / 1000)),
      ended: requests.length === 0 ? null : (end.at - requests[0].at) / 1000,
      round: round ? {requests: round.requests, claim: round.claim} : null,
      files,
      stderr,
    };
  } finally {
    clearTimeout(guard); clearTimeout(reopen);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    for (const s of servers) { s.closeAllConnections(); if (s.listening) await new Promise(resolve => s.close(resolve)); }
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// The observer: each check names what it compared.
const checks = {
  exit(o, code) { assert.equal(o.exit, code, 'CLI exit code (attempts ' + JSON.stringify(o.attempts) + ', error ' + JSON.stringify(o.error) + ', stderr: ' + o.stderr + ')'); },
  noError(o) { assert.equal(o.error, null, 'CLI error event'); },
  error(o, want) { assert.deepEqual(o.error, want, 'CLI error event'); },
  attempts(o, want) { assert.deepEqual(o.attempts, want, 'request.attempt records (outcome, end_reason) in order'); },
  requests(o, n) { assert.equal(o.requests, n, 'HTTP requests the fake provider received (attempts ' + JSON.stringify(o.attempts) + ')'); },
  round(o, n, claim) { assert.deepEqual(o.round, {requests: n, claim}, 'round.ended requests and claim'); },
  file(o, name, content) { assert.equal(o.files[name], content, 'contents of ' + name + ' in the task root'); },
  carried(o, n, callID) {
    const input = o.inputs[n - 1];
    assert.ok(Array.isArray(input), 'no HTTP request ' + n + ' arrived');
    const call = input.find(i => i && i.type === 'function_call' && i.call_id === callID);
    const output = input.find(i => i && i.type === 'function_call_output' && i.call_id === callID);
    assert.ok(call && output, 'HTTP request ' + n + ' does not carry call ' + callID + ' and its output: ' + JSON.stringify(input));
  },
  afterOpen(o, n, s) {
    const w = o.after_open[n - 1];
    assert.equal(typeof w, 'number', 'HTTP request ' + n + ' did not arrive after the listener opened again; after_open ' + JSON.stringify(o.after_open));
    assert.ok(w < s, 'HTTP request ' + n + ' arrived ' + w.toFixed(3) + ' s after the listener opened again, expected under ' + s + ' s');
  },
  endedWithin(o, s) { assert.ok(o.ended !== null && o.ended < s, 'the CLI ended ' + o.ended + ' s after the first HTTP request, expected under ' + s + ' s'); },
};

// Known-good and known-bad observations for the checks above (no CLI, no network).
function controls(kind) {
  const unavailable = {class: 'provider', reason: 'unavailable', detail: 'ChatGPT did not answer after 3 attempts: HTTP 503 overloaded'};
  const deadline = {class: 'loop', reason: 'deadline', detail: 'the round did not end within 6 seconds'};
  const refused = {class: 'provider', reason: 'refused', detail: 'ChatGPT refused the request: 400 bad request'};
  const call = {type: 'function_call', id: 'fc_call_1', call_id: 'call_1', name: 'write_file', arguments: '{}'};
  const out = {type: 'function_call_output', call_id: 'call_1', output: 'ok'};
  const ok = {outcome: 'completed', end_reason: 'complete'}, dial = {outcome: 'failed', end_reason: 'transport'}, http = {outcome: 'failed', end_reason: null};
  const good = {
    waited: {exit: 0, error: null, attempts: [ok, dial, ok], requests: 2, inputs: [[], [call, out]], after_open: [null, 1.02], ended: 15.1, round: {requests: 2, claim: 'done'}, files: {'progress.txt': 'step one'}, stderr: ''},
    capped: {exit: 1, error: unavailable, attempts: [dial, http, http], requests: 2, inputs: [[], []], after_open: [0.9, 0.91], ended: 0.01, round: null, files: {}, stderr: ''},
    never: {exit: 1, error: deadline, attempts: [dial], requests: 0, inputs: [], after_open: [], ended: null, round: null, files: {}, stderr: ''},
    refusal: {exit: 1, error: refused, attempts: [http], requests: 1, inputs: [[]], after_open: [null], ended: 0.01, round: null, files: {}, stderr: ''},
    temporary: {exit: 1, error: unavailable, attempts: [http, http, http], requests: 3, inputs: [[], [], []], after_open: [null, null, null], ended: 0.02, round: null, files: {}, stderr: ''},
  };
  const judge = {
    waited: o => { checks.exit(o, 0); checks.noError(o); checks.round(o, 2, 'done'); checks.file(o, 'progress.txt', 'step one'); checks.attempts(o, [ok, dial, ok]); checks.requests(o, 2); checks.carried(o, 2, 'call_1'); checks.afterOpen(o, 2, 2.5); },
    capped: o => { checks.exit(o, 1); checks.error(o, unavailable); checks.attempts(o, [dial, http, http]); checks.requests(o, 2); },
    never: o => { checks.exit(o, 1); checks.error(o, deadline); checks.attempts(o, [dial]); checks.requests(o, 0); },
    refusal: o => { checks.exit(o, 1); checks.error(o, refused); checks.attempts(o, [http]); checks.requests(o, 1); },
    temporary: o => { checks.exit(o, 1); checks.error(o, unavailable); checks.attempts(o, [http, http, http]); checks.requests(o, 3); checks.endedWithin(o, 2); },
  };
  for (const [name, o] of Object.entries(good)) judge[name](o);
  if (kind === 'good') { process.stdout.write('net-retry-stage observer accepted\n'); return; }
  const lost = {class: 'provider', reason: 'unavailable', detail: 'ChatGPT did not answer after 3 attempts: network error: dial tcp 127.0.0.1:50000: connect: connection refused'};
  const bad = [
    ['waited', o => { o.exit = 1; o.error = lost; o.attempts = [ok, dial, dial, dial]; o.requests = 1; o.round = null; o.after_open = [null]; }],
    ['waited', o => { o.error = lost; }], ['waited', o => { o.round = {requests: 1, claim: 'done'}; }], ['waited', o => { o.files = {}; }],
    ['waited', o => { o.attempts = [ok, dial, dial, ok]; }], ['waited', o => { o.requests = 3; }], ['waited', o => { o.inputs = [[], [out]]; }],
    ['waited', o => { o.inputs = [[], [call]]; }], ['waited', o => { o.after_open = [null, 8.0]; }], ['waited', o => { o.after_open = [null, null]; }],
    ['capped', o => { o.requests = 1; }], ['capped', o => { o.requests = 3; o.attempts = [dial, http, http, http]; }], ['capped', o => { o.error = lost; }],
    ['never', o => { o.attempts = [dial, dial]; }], ['never', o => { o.error = lost; }], ['never', o => { o.requests = 1; }],
    ['refusal', o => { o.attempts = [http, http]; o.requests = 2; }], ['refusal', o => { o.error = unavailable; }], ['refusal', o => { o.exit = 0; }],
    ['temporary', o => { o.ended = 3.5; }], ['temporary', o => { o.attempts = [http, http]; }], ['temporary', o => { o.error = null; }],
  ];
  for (const [i, [name, mutate]] of bad.entries()) {
    const o = structuredClone(good[name]); mutate(o);
    let rejected = false; try { judge[name](o); } catch (_) { rejected = true; }
    if (!rejected) { process.stdout.write('net-retry-stage observer accepted bad observation ' + i + '\n'); process.exitCode = 3; return; }
  }
  process.stdout.write('net-retry-stage observer rejected\n'); process.exitCode = 1;
}

if (require.main === module) {
  if (process.argv[2] === '--control') controls(process.argv[3]);
  else if (process.argv[2] === '--run') {
    exercise(JSON.parse(process.argv[3])).then(o => console.log(JSON.stringify(o)), e => { console.error(e.stack); process.exitCode = 2; }).finally(cleanup);
  }
} else {
  const {When, Then, AfterAll} = require('@cucumber/cucumber');
  When('the CLI runs a round against the outage fake provider:', {timeout: 180000}, async function (text) { this.outage = await exercise(JSON.parse(text)); });
  Then('the outage run exited with code {int}', function (code) { checks.exit(this.outage, code); });
  Then('the outage run reported no error event', function () { checks.noError(this.outage); });
  Then('the outage run reported the error event:', function (text) { checks.error(this.outage, JSON.parse(text)); });
  Then('the outage run recorded these attempts in order:', function (text) { checks.attempts(this.outage, JSON.parse(text)); });
  Then('the outage fake provider received {int} HTTP request(s)', function (n) { checks.requests(this.outage, n); });
  Then('the outage run ended its round after {int} request(s) with the claim {string}', function (n, claim) { checks.round(this.outage, n, claim); });
  Then('the outage run left the file {string} containing {string}', function (name, content) { checks.file(this.outage, name, content); });
  Then('outage HTTP request {int} carried call {string} and its output', function (n, id) { checks.carried(this.outage, n, id); });
  Then('outage HTTP request {int} arrived within {float} seconds after the listener opened again', function (n, s) { checks.afterOpen(this.outage, n, s); });
  Then('the outage run ended within {float} seconds of the first HTTP request', function (s) { checks.endedWithin(this.outage, s); });
  AfterAll(cleanup);
}
