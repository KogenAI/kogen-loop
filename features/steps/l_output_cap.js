'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

// The real kogen-loop CLI runs one round against a local fake provider (KOGEN_PROVIDER_URL):
// ChatGPT Responses (POST /v1/responses) or Anthropic Messages (POST /v1/messages), both streamed.
// Each scripted answer is one of:
//   {"kind":"runaway","delta":D,"cap":C}  visible-output deltas of D ASCII bytes until the client
//       closes the connection or C bytes were sent, then the provider's own output-cap ending
//       (Responses response.incomplete with reason max_output_tokens and output_tokens 128000;
//       Messages message_delta with stop_reason max_tokens, then message_stop).
//   {"kind":"answer","text":T}  a short complete text answer.
//   {"kind":"long","visible":V,"reasoning":R,"delta":D}  a complete answer whose visible-output
//       deltas carry exactly V bytes, after R bytes of reasoning deltas (Responses
//       reasoning_summary_text deltas, Messages thinking deltas), with the usual done events.
let binDir, binary;
function build() {
  if (binary) return binary;
  binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-output-cap-bin-'));
  const out = path.join(binDir, 'kogen-loop');
  const b = spawnSync('go', ['build', '-o', out, './cmd/kogen-loop'], {encoding: 'utf8', timeout: 100000});
  assert.equal(b.status, 0, 'go build ./cmd/kogen-loop failed: ' + b.stdout + b.stderr + (b.error || ''));
  return (binary = out);
}
function cleanup() { if (binDir) fs.rmSync(binDir, {recursive: true, force: true}); binDir = binary = undefined; }

const frame = ev => 'data: ' + JSON.stringify(ev) + '\n\n';
const mframe = ev => 'event: ' + ev.type + '\ndata: ' + JSON.stringify(ev) + '\n\n';
const chunks = (n, size) => { const out = []; for (let i = 0; i < n; i += size) out.push('x'.repeat(Math.min(size, n - i))); return out; };

// send writes with backpressure and reports whether the client still has the connection open.
async function send(res, state, text) {
  if (state.closed) return false;
  if (!res.write(text)) {
    await new Promise(resolve => {
      const done = () => { res.off('drain', done); res.off('close', done); resolve(); };
      res.on('drain', done); res.on('close', done);
    });
  }
  return !state.closed;
}

async function responses(res, state, a) {
  const usage = out => ({input_tokens: 10, input_tokens_details: {cached_tokens: 0}, output_tokens: out, output_tokens_details: {reasoning_tokens: 0}});
  res.writeHead(200, {'Content-Type': 'text/event-stream', 'X-Request-Id': 'req-output-cap'});
  if (!await send(res, state, frame({type: 'response.created', response: {id: 'resp_output_cap', status: 'in_progress'}}))) return;
  if (a.kind === 'answer') {
    const item = {type: 'message', id: 'msg_1', status: 'completed', role: 'assistant', content: [{type: 'output_text', text: a.text, annotations: []}]};
    await send(res, state, frame({type: 'response.output_item.done', output_index: 0, item}));
    res.end(frame({type: 'response.completed', response: {id: 'resp_output_cap', status: 'completed', usage: usage(1)}}));
    return;
  }
  let index = 0;
  if (a.kind === 'long' && a.reasoning > 0) {
    if (!await send(res, state, frame({type: 'response.output_item.added', output_index: 0, item: {type: 'reasoning', id: 'rs_1', summary: []}}))) return;
    for (const d of chunks(a.reasoning, a.delta)) {
      if (!await send(res, state, frame({type: 'response.reasoning_summary_text.delta', item_id: 'rs_1', output_index: 0, summary_index: 0, delta: d}))) return;
    }
    if (!await send(res, state, frame({type: 'response.output_item.done', output_index: 0, item: {type: 'reasoning', id: 'rs_1', summary: [{type: 'summary_text', text: 'x'.repeat(a.reasoning)}], encrypted_content: 'opaque'}}))) return;
    index = 1;
  }
  if (!await send(res, state, frame({type: 'response.output_item.added', output_index: index, item: {type: 'message', id: 'msg_1', status: 'in_progress', role: 'assistant', content: []}}))) return;
  const delta = d => frame({type: 'response.output_text.delta', item_id: 'msg_1', output_index: index, content_index: 0, delta: d});
  if (a.kind === 'runaway') {
    for (let sent = 0; sent < a.cap; sent += a.delta) {
      if (!await send(res, state, delta('x'.repeat(a.delta)))) return;
      state.visible += a.delta;
    }
    const response = {id: 'resp_output_cap', status: 'incomplete', incomplete_details: {reason: 'max_output_tokens'}, usage: usage(128000)};
    res.end(frame({type: 'response.incomplete', response}));
    state.capped = true;
    return;
  }
  for (const d of chunks(a.visible, a.delta)) {
    if (!await send(res, state, delta(d))) return;
    state.visible += d.length;
  }
  const text = 'x'.repeat(a.visible);
  if (!await send(res, state, frame({type: 'response.output_text.done', item_id: 'msg_1', output_index: index, content_index: 0, text}))) return;
  const item = {type: 'message', id: 'msg_1', status: 'completed', role: 'assistant', content: [{type: 'output_text', text, annotations: []}]};
  if (!await send(res, state, frame({type: 'response.output_item.done', output_index: index, item}))) return;
  res.end(frame({type: 'response.completed', response: {id: 'resp_output_cap', status: 'completed', usage: usage(Math.ceil(a.visible / 4))}}));
}

async function messages(res, state, a) {
  res.writeHead(200, {'Content-Type': 'text/event-stream', 'Request-Id': 'req-output-cap'});
  if (!await send(res, state, mframe({type: 'message_start', message: {id: 'msg_output_cap', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], usage: {input_tokens: 10, output_tokens: 1}}}))) return;
  let index = 0;
  if (a.kind === 'long' && a.reasoning > 0) {
    if (!await send(res, state, mframe({type: 'content_block_start', index: 0, content_block: {type: 'thinking', thinking: ''}}))) return;
    for (const d of chunks(a.reasoning, a.delta)) {
      if (!await send(res, state, mframe({type: 'content_block_delta', index: 0, delta: {type: 'thinking_delta', thinking: d}}))) return;
    }
    if (!await send(res, state, mframe({type: 'content_block_delta', index: 0, delta: {type: 'signature_delta', signature: 'signature'}}))) return;
    if (!await send(res, state, mframe({type: 'content_block_stop', index: 0}))) return;
    index = 1;
  }
  if (!await send(res, state, mframe({type: 'content_block_start', index, content_block: {type: 'text', text: ''}}))) return;
  const delta = d => mframe({type: 'content_block_delta', index, delta: {type: 'text_delta', text: d}});
  const end = (reason, out) => mframe({type: 'content_block_stop', index}) + mframe({type: 'message_delta', delta: {stop_reason: reason, stop_sequence: null}, usage: {output_tokens: out}}) + mframe({type: 'message_stop'});
  if (a.kind === 'answer') {
    if (!await send(res, state, delta(a.text))) return;
    res.end(end('end_turn', 1));
    return;
  }
  if (a.kind === 'runaway') {
    for (let sent = 0; sent < a.cap; sent += a.delta) {
      if (!await send(res, state, delta('x'.repeat(a.delta)))) return;
      state.visible += a.delta;
    }
    res.end(end('max_tokens', 128000));
    state.capped = true;
    return;
  }
  for (const d of chunks(a.visible, a.delta)) {
    if (!await send(res, state, delta(d))) return;
    state.visible += d.length;
  }
  res.end(end('end_turn', Math.ceil(a.visible / 4)));
}

// exercise runs one CLI round and returns what the fake and the CLI's JSONL showed.
async function exercise(provider, answers) {
  const bin = build();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-output-cap-'));
  const times = [], fake = [], faults = [];
  let child, server, guard, stdout = '', stderr = '', timedOut = false;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root, {mode: 0o700});
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials');
    fs.mkdirSync(creds, {recursive: true, mode: 0o700});
    for (const d of [home, path.join(home, '.kogen'), creds]) fs.chmodSync(d, 0o700);
    if (provider === 'chatgpt') {
      fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600}), {mode: 0o600});
    } else {
      assert.equal(provider, 'anthropic', 'unknown fixture provider ' + provider);
      fs.writeFileSync(path.join(creds, 'anthropic.json'), JSON.stringify({provider: 'anthropic', api_key: 'SYNTHETIC_API_KEY_0001'}), {mode: 0o600});
    }
    const route = provider === 'chatgpt' ? 'POST /v1/responses' : 'POST /v1/messages';
    server = http.createServer(async (req, res) => {
      const state = {closed: false, visible: 0, capped: false};
      res.on('close', () => { state.closed = true; });
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        times.push(performance.now());
        assert.equal(req.method + ' ' + req.url, route);
        JSON.parse(raw);
        const answer = answers[fake.length];
        assert.ok(answer, 'unexpected request ' + (fake.length + 1) + ': the script has ' + answers.length + ' answers');
        fake.push(state);
        await (provider === 'chatgpt' ? responses : messages)(res, state, answer);
      } catch (e) {
        faults.push(e.message);
        if (!res.headersSent) res.writeHead(400, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: {message: 'fixture fault'}}));
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const role = provider === 'chatgpt' ? {provider: 'chatgpt', model: 'gpt-6.1-terra', effort: 'high', base_url: ''} : {provider: 'anthropic', model: 'claude-opus-5-5', effort: 'high', base_url: ''};
    const task = {protocol: 'kogen-loop/v1', root, role, instructions: '', prompt: 'fixture task', tools: [], protected: [], excluded: [], terminal: [], deadline_seconds: 0, session: {dir: '', resume: false}, requires: []};
    child = spawn(bin, ['run', '--task', '-'], {cwd: root, env: {HOME: home, TMPDIR: dir, PATH: process.env.PATH, KOGEN_PROVIDER_URL: 'http://127.0.0.1:' + server.address().port}});
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => { stderr += b; });
    child.stdin.on('error', () => {});
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({code, signal})); });
    child.stdin.end(JSON.stringify(task));
    guard = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 60000);
    const end = await done;
    assert.equal(timedOut, false, 'the CLI did not end within the 60 s fixture guard: ' + stderr);
    assert.deepEqual(faults, [], 'fake provider faults');
    const events = stdout.trim() === '' ? [] : stdout.trim().split('\n').map(l => JSON.parse(l));
    const error = events.find(e => e.type === 'error');
    const round = events.find(e => e.type === 'round.ended');
    return {
      exit: end.code,
      requests: times.length,
      waits: times.slice(1).map((t, i) => (t - times[i]) / 1000),
      attempts: events.filter(e => e.type === 'request.attempt').map(e => ({outcome: e.record.outcome, error: e.record.error, end_reason: e.record.end_reason, stream_bytes: e.record.stream_bytes})),
      ending: round ? round.ending : null,
      error: error ? {class: error.class, reason: error.reason, detail: error.detail} : null,
      fake: fake.map(s => ({visible: s.visible, capped: s.capped})),
      stderr,
    };
  } finally {
    clearTimeout(guard);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// The observer: each check names what it compared and shows the observation.
const show = o => ' (observation: ' + JSON.stringify({...o, stderr: undefined}) + '; CLI stderr: ' + o.stderr + ')';
const attempt = (o, n) => {
  const a = o.attempts[n - 1];
  assert.ok(a, 'the CLI reported no request.attempt ' + n + show(o));
  return a;
};
const checks = {
  requests(o, n) { assert.equal(o.requests, n, 'fake provider requests' + show(o)); },
  exit(o, code) { assert.equal(o.exit, code, 'CLI exit code' + show(o)); },
  noCall(o) { assert.equal(o.ending, 'no_call', 'round.ended ending' + show(o)); },
  failed(o, n, reason) {
    const a = attempt(o, n);
    assert.deepEqual({outcome: a.outcome, error: a.error, end_reason: a.end_reason}, {outcome: 'failed', error: 'provider_failure', end_reason: reason}, 'request.attempt ' + n + show(o));
  },
  completed(o, n) {
    const a = attempt(o, n);
    assert.deepEqual({outcome: a.outcome, error: a.error, end_reason: a.end_reason}, {outcome: 'completed', error: null, end_reason: 'complete'}, 'request.attempt ' + n + show(o));
  },
  bytes(o, n, low, high) {
    const a = attempt(o, n);
    assert.ok(Number.isInteger(a.stream_bytes) && a.stream_bytes > low && a.stream_bytes < high, 'request.attempt ' + n + ' stream_bytes ' + a.stream_bytes + ', expected more than ' + low + ' and fewer than ' + high + show(o));
  },
  noError(o) { assert.equal(o.error, null, 'CLI error event' + show(o)); },
  error(o, want) { assert.deepEqual(o.error, want, 'CLI error event' + show(o)); },
  wait(o, n, low, high) {
    const w = o.waits[n - 2];
    assert.equal(typeof w, 'number', 'no request ' + n + ' arrived' + show(o));
    assert.ok(w >= low && w < high, 'wait before request ' + n + ' was ' + w.toFixed(3) + ' s, expected at least ' + low + ' s and under ' + high + ' s' + show(o));
  },
};

// Known-good and known-bad observations for the checks above (no CLI, no network).
function controls(kind) {
  const detail = 'ChatGPT did not answer after 3 attempts: visible output exceeded 131072 bytes';
  const cut = {outcome: 'failed', error: 'provider_failure', end_reason: 'output_limit', stream_bytes: 180000};
  const ok = bytes => ({outcome: 'completed', error: null, end_reason: 'complete', stream_bytes: bytes});
  const good = {
    retried: {exit: 0, requests: 2, waits: [2.004], attempts: [cut, ok(600)], ending: 'no_call', error: null, fake: [], stderr: ''},
    exhausted: {exit: 1, requests: 3, waits: [2.004, 8.003], attempts: [cut, cut, cut], ending: null, error: {class: 'provider', reason: 'unavailable', detail}, fake: [], stderr: ''},
    long: {exit: 0, requests: 1, waits: [], attempts: [ok(400000)], ending: 'no_call', error: null, fake: [], stderr: ''},
  };
  const judge = {
    retried: o => { checks.requests(o, 2); checks.wait(o, 2, 1.9, 2.9); checks.failed(o, 1, 'output_limit'); checks.bytes(o, 1, 131072, 262144); checks.completed(o, 2); checks.exit(o, 0); checks.noCall(o); checks.noError(o); },
    exhausted: o => { checks.requests(o, 3); checks.wait(o, 2, 1.9, 2.9); checks.wait(o, 3, 7.9, 9.5); for (const n of [1, 2, 3]) { checks.failed(o, n, 'output_limit'); checks.bytes(o, n, 131072, 262144); } checks.exit(o, 1); checks.error(o, {class: 'provider', reason: 'unavailable', detail}); },
    long: o => { checks.requests(o, 1); checks.completed(o, 1); checks.bytes(o, 1, 131072, 1048576); checks.exit(o, 0); checks.noCall(o); checks.noError(o); },
  };
  for (const [name, o] of Object.entries(good)) judge[name](o);
  if (kind === 'good') { process.stdout.write('output-cap observer accepted\n'); return; }
  const bad = [
    ['retried', o => { o.requests = 1; o.waits = []; o.attempts = [o.attempts[0]]; }],
    ['retried', o => { o.waits = [0.5]; }],
    ['retried', o => { o.attempts[0].end_reason = 'complete'; }],
    ['retried', o => { o.attempts[0].end_reason = 'transport'; }],
    ['retried', o => { o.attempts[0].outcome = 'completed'; }],
    ['retried', o => { o.attempts[0].error = null; }],
    ['retried', o => { o.attempts[0].stream_bytes = 600000; }],
    ['retried', o => { o.attempts[0].stream_bytes = 120000; }],
    ['retried', o => { o.attempts[0].stream_bytes = null; }],
    ['retried', o => { o.attempts[1].outcome = 'failed'; }],
    ['retried', o => { o.attempts = [o.attempts[0]]; }],
    ['retried', o => { o.exit = 1; }],
    ['retried', o => { o.ending = 'terminal'; }],
    ['retried', o => { o.error = {class: 'provider', reason: 'refused', detail: 'ChatGPT refused the request: stream'}; }],
    ['exhausted', o => { o.requests = 1; o.waits = []; o.attempts = [o.attempts[0]]; o.error = {class: 'provider', reason: 'refused', detail: 'ChatGPT refused the request: stream'}; }],
    ['exhausted', o => { o.waits = [2.0, 2.0]; }],
    ['exhausted', o => { o.attempts[2].end_reason = 'complete'; }],
    ['exhausted', o => { o.attempts[1].stream_bytes = 560000; }],
    ['exhausted', o => { o.error.detail = 'ChatGPT did not answer after 3 attempts: stream exceeded 67108864 bytes'; }],
    ['exhausted', o => { o.error.reason = 'invalid_response'; }],
    ['exhausted', o => { o.exit = 0; }],
    ['long', o => { o.requests = 2; o.waits = [2.0]; }],
    ['long', o => { o.attempts[0] = cut; }],
    ['long', o => { o.attempts[0].stream_bytes = 100000; }],
    ['long', o => { o.exit = 1; }],
    ['long', o => { o.ending = null; }],
    ['long', o => { o.error = {class: 'provider', reason: 'unavailable', detail}; }],
  ];
  for (const [i, [name, mutate]] of bad.entries()) {
    const o = structuredClone(good[name]); mutate(o);
    let rejected = false; try { judge[name](o); } catch (_) { rejected = true; }
    if (!rejected) { process.stdout.write('output-cap observer accepted bad observation ' + i + '\n'); process.exitCode = 3; return; }
  }
  process.stdout.write('output-cap observer rejected\n'); process.exitCode = 1;
}

if (require.main === module) {
  if (process.argv[2] === '--control') controls(process.argv[3]);
  else if (process.argv[2] === '--run') {
    exercise(process.argv[3], JSON.parse(process.argv[4])).then(o => console.log(JSON.stringify(o)), e => { console.error(e.stack); process.exitCode = 2; }).finally(cleanup);
  }
} else {
  const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
  Given('the output-cap kogen-loop CLI is built', {timeout: 115000}, function () { build(); });
  When('the output-cap CLI runs a {string} round against a fake provider scripted as:', {timeout: 115000}, async function (provider, text) { this.outputCap = await exercise(provider, JSON.parse(text)); });
  Then('the output-cap fake received {int} request(s)', function (n) { checks.requests(this.outputCap, n); });
  Then('the output-cap wait before request {int} was at least {float} and under {float} seconds', function (n, low, high) { checks.wait(this.outputCap, n, low, high); });
  Then('output-cap attempt {int} failed with end_reason {string}', function (n, reason) { checks.failed(this.outputCap, n, reason); });
  Then('output-cap attempt {int} completed', function (n) { checks.completed(this.outputCap, n); });
  Then('output-cap attempt {int} read more than {int} and fewer than {int} stream bytes', function (n, low, high) { checks.bytes(this.outputCap, n, low, high); });
  Then('the output-cap CLI exited with code {int}', function (code) { checks.exit(this.outputCap, code); });
  Then('the output-cap round ended without a tool call', function () { checks.noCall(this.outputCap); });
  Then('the output-cap CLI reported no error', function () { checks.noError(this.outputCap); });
  Then('the output-cap CLI reported the error:', function (text) { checks.error(this.outputCap, JSON.parse(text)); });
  AfterAll(cleanup);
}
