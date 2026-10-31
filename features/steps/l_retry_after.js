'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

// The real CLI against a local fake Responses server (KOGEN_PROVIDER_URL). Each scripted answer is
// {"status": 200|429|503|..., "retry_after": "<header value>"}; a non-200 answer has the JSON body
// {"error":{"message":"rate limited"}}. Request times are taken when each request body has arrived.
let binDir, binary;
function cli() {
  if (binary) return binary;
  binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-retry-after-bin-'));
  const out = path.join(binDir, 'kogen-loop');
  const b = spawnSync('go', ['build', '-o', out, './cmd/kogen-loop'], {encoding: 'utf8', timeout: 120000});
  assert.equal(b.status, 0, 'go build ./cmd/kogen-loop failed: ' + b.stdout + b.stderr + (b.error || ''));
  return (binary = out);
}
function cleanup() { if (binDir) fs.rmSync(binDir, {recursive: true, force: true}); binDir = binary = undefined; }

// exercise runs one CLI round. watch > 0 stops a still-running CLI (SIGTERM) that many seconds
// after the first request and records running: true.
async function exercise(answers, watch = 0) {
  const bin = cli();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-retry-after-'));
  const times = [], faults = [];
  let child, server, guard, stopper, first, stdout = '', stderr = '', running = false, timedOut = false;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive: true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600}));
    server = http.createServer(async (req, res) => {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const at = performance.now();
        assert.equal(req.method + ' ' + req.url, 'POST /v1/responses');
        JSON.parse(raw);
        const answer = answers[times.length];
        times.push(at);
        if (times.length === 1) {
          first = at;
          if (watch > 0) stopper = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) { running = true; child.kill('SIGTERM'); } }, watch * 1000);
        }
        assert.ok(answer, 'unexpected request ' + times.length + ': the script has ' + answers.length + ' answers');
        if (answer.status !== 200) {
          const headers = {'Content-Type': 'application/json'};
          if (answer.retry_after !== undefined) headers['Retry-After'] = answer.retry_after;
          res.writeHead(answer.status, headers);
          res.end(JSON.stringify({error: {message: 'rate limited'}}));
          return;
        }
        res.writeHead(200, {'Content-Type': 'text/event-stream'});
        res.write('data: ' + JSON.stringify({type: 'response.output_item.done', output_index: 0, item: {type: 'message', role: 'assistant', content: [{type: 'output_text', text: 'done'}]}}) + '\n\n');
        res.end('data: ' + JSON.stringify({type: 'response.completed', response: {status: 'completed'}}) + '\n\n');
      } catch (e) {
        faults.push(e.message);
        if (!res.headersSent) res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: {message: 'fixture fault'}}));
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const task = {protocol: 'kogen-loop/v1', root, role: {provider: 'chatgpt', model: 'fixture-model', effort: 'medium', base_url: ''}, instructions: '', prompt: 'fixture task', tools: [], protected: [], excluded: [], terminal: [], deadline_seconds: 0, session: {dir: '', resume: false}, requires: []};
    child = spawn(bin, ['run', '--task', '-'], {cwd: root, env: {HOME: home, TMPDIR: dir, PATH: process.env.PATH, KOGEN_PROVIDER_URL: 'http://127.0.0.1:' + server.address().port}});
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => { stderr += b; });
    child.stdin.on('error', () => {});
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({code, signal, at: performance.now()})); });
    child.stdin.end(JSON.stringify(task));
    guard = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 40000);
    const end = await done;
    assert.equal(timedOut, false, 'the CLI did not end within the 40 s fixture guard: ' + stderr);
    assert.deepEqual(faults, [], 'fake provider faults');
    const events = stdout.trim() === '' ? [] : stdout.trim().split('\n').map(l => JSON.parse(l));
    const error = events.find(e => e.type === 'error');
    return {
      exit: end.code,
      requests: times.length,
      waits: times.slice(1).map((t, i) => (t - times[i]) / 1000),
      ended: first === undefined ? null : (end.at - first) / 1000,
      running,
      error: error ? {class: error.class, reason: error.reason, detail: error.detail} : null,
      stderr,
    };
  } finally {
    clearTimeout(guard); clearTimeout(stopper);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// The observer: each check names what it compared.
const checks = {
  requests(o, n) { assert.equal(o.requests, n, 'fake provider requests (CLI stderr: ' + o.stderr + ')'); },
  wait(o, n, low, high) {
    const w = o.waits[n - 2];
    assert.equal(typeof w, 'number', 'no request ' + n + ' arrived; waits ' + JSON.stringify(o.waits));
    assert.ok(w >= low && w < high, 'wait before request ' + n + ' was ' + w.toFixed(3) + ' s, expected at least ' + low + ' s and under ' + high + ' s');
  },
  exit(o, code) { assert.equal(o.exit, code, 'CLI exit code (stderr: ' + o.stderr + ')'); },
  error(o, want) { assert.deepEqual(o.error, want, 'CLI error event'); },
  endedWithin(o, s) {
    assert.equal(o.running, false, 'the CLI was still running');
    assert.ok(o.ended !== null && o.ended < s, 'the CLI ended ' + o.ended + ' s after the first request, expected under ' + s + ' s');
  },
  stillWaiting(o) { assert.equal(o.running, true, 'the CLI had already ended (exit ' + o.exit + ')'); },
};

// Known-good and known-bad observations for the checks above (no CLI, no network).
function controls(kind) {
  const detail = 'ChatGPT asked to wait 61 s before retrying, more than the 60 s limit: HTTP 429 rate limited';
  const good = {
    honoured: {exit: 0, requests: 2, waits: [3.004], ended: 3.01, running: false, error: null, stderr: ''},
    schedule: {exit: 1, requests: 3, waits: [2.005, 8.004], ended: 10.01, running: false, error: {class: 'provider', reason: 'unavailable', detail: 'ChatGPT did not answer after 3 attempts: HTTP 429 rate limited'}, stderr: ''},
    beyond: {exit: 1, requests: 1, waits: [], ended: 0.02, running: false, error: {class: 'provider', reason: 'unavailable', detail}, stderr: ''},
    waiting: {exit: 143, requests: 1, waits: [], ended: 3.0, running: true, error: null, stderr: ''},
  };
  const judge = {
    honoured: o => { checks.requests(o, 2); checks.wait(o, 2, 2.9, 4.5); checks.exit(o, 0); },
    schedule: o => { checks.requests(o, 3); checks.wait(o, 2, 1.9, 2.9); checks.wait(o, 3, 7.9, 9.5); checks.exit(o, 1); checks.error(o, good.schedule.error); },
    beyond: o => { checks.requests(o, 1); checks.exit(o, 1); checks.error(o, {class: 'provider', reason: 'unavailable', detail}); checks.endedWithin(o, 1.5); },
    waiting: o => { checks.requests(o, 1); checks.stillWaiting(o); },
  };
  for (const [name, o] of Object.entries(good)) judge[name](o);
  if (kind === 'good') { process.stdout.write('retry-after observer accepted\n'); return; }
  const bad = [
    ['honoured', o => { o.waits = [2.004]; }], ['honoured', o => { o.waits = [4.6]; }], ['honoured', o => { o.waits = []; o.requests = 1; }],
    ['honoured', o => { o.requests = 3; }], ['honoured', o => { o.exit = 1; }],
    ['schedule', o => { o.waits = [3.0, 8.0]; }], ['schedule', o => { o.waits = [2.0, 3.0]; }], ['schedule', o => { o.waits = [2.0]; o.requests = 2; }],
    ['schedule', o => { o.error.detail = 'ChatGPT did not answer after 2 attempts: HTTP 429 rate limited'; }], ['schedule', o => { o.exit = 0; }],
    ['beyond', o => { o.requests = 2; o.waits = [2.0]; }], ['beyond', o => { o.ended = 2.1; }], ['beyond', o => { o.running = true; }],
    ['beyond', o => { o.error.detail = 'ChatGPT did not answer after 3 attempts: HTTP 429 rate limited'; }], ['beyond', o => { o.error = null; }],
    ['waiting', o => { o.running = false; }], ['waiting', o => { o.requests = 2; o.waits = [2.0]; }],
  ];
  for (const [i, [name, mutate]] of bad.entries()) {
    const o = structuredClone(good[name]); mutate(o);
    let rejected = false; try { judge[name](o); } catch (_) { rejected = true; }
    if (!rejected) { process.stdout.write('retry-after observer accepted bad observation ' + i + '\n'); process.exitCode = 3; return; }
  }
  process.stdout.write('retry-after observer rejected\n'); process.exitCode = 1;
}

if (require.main === module) {
  if (process.argv[2] === '--control') controls(process.argv[3]);
  else if (process.argv[2] === '--run') {
    exercise(JSON.parse(process.argv[3]), Number(process.argv[4] || 0)).then(o => console.log(JSON.stringify(o)), e => { console.error(e.stack); process.exitCode = 2; }).finally(cleanup);
  }
} else {
  const {When, Then, AfterAll} = require('@cucumber/cucumber');
  When('the CLI runs against a fake provider answering:', {timeout: 180000}, async function (text) { this.retry = await exercise(JSON.parse(text)); });
  When('the CLI runs against a fake provider answering, stopped {float} seconds after the first request:', {timeout: 180000}, async function (s, text) { this.retry = await exercise(JSON.parse(text), s); });
  Then('the fake provider received {int} request(s)', function (n) { checks.requests(this.retry, n); });
  Then('the wait before request {int} was at least {float} and under {float} seconds', function (n, low, high) { checks.wait(this.retry, n, low, high); });
  Then('the CLI exited with code {int}', function (code) { checks.exit(this.retry, code); });
  Then('the CLI reported the error:', function (text) { checks.error(this.retry, JSON.parse(text)); });
  Then('the CLI ended within {float} seconds of the first request', function (s) { checks.endedWithin(this.retry, s); });
  Then('the CLI was still waiting when it was stopped', function () { checks.stillWaiting(this.retry); });
  AfterAll(cleanup);
}
