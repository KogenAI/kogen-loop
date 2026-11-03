'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

// The real CLI against a local fake ChatGPT server (KOGEN_PROVIDER_URL and KOGEN_AUTH_URL). Each
// scripted answer is {"status": 200|429, "retry_after": "<header value>"}; a 429 has the JSON body
// {"error":{"message":"rate limited"}}. With refresh_delay_ms the saved token has expired, and the
// fake token endpoint answers the refresh after that many milliseconds. The observation keeps the
// `record` of every request.attempt event and the host load read before and after the run.
let binDir, binary;
function cli() {
  if (binary) return binary;
  binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-attempt-gap-load-bin-'));
  const out = path.join(binDir, 'kogen-loop');
  const b = spawnSync('go', ['build', '-o', out, './cmd/kogen-loop'], {encoding: 'utf8', timeout: 120000});
  assert.equal(b.status, 0, 'go build ./cmd/kogen-loop failed: ' + b.stdout + b.stderr + (b.error || ''));
  return (binary = out);
}
function cleanup() { if (binDir) fs.rmSync(binDir, {recursive: true, force: true}); binDir = binary = undefined; }

// hostLoad is the host's 1, 5 and 15 minute load average as the system prints it.
function hostLoad() {
  if (process.platform === 'darwin') {
    const r = spawnSync('/usr/sbin/sysctl', ['-n', 'vm.loadavg'], {encoding: 'utf8'});
    assert.equal(r.status, 0, 'sysctl -n vm.loadavg failed: ' + r.stdout + r.stderr + (r.error || ''));
    const m = /^\{\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*\}\s*$/.exec(r.stdout);
    assert.ok(m, 'unexpected sysctl -n vm.loadavg output: ' + JSON.stringify(r.stdout));
    return m.slice(1, 4).map(Number);
  }
  if (process.platform === 'linux') return fs.readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/).slice(0, 3).map(Number);
  assert.fail('host load is read only on darwin and linux, not ' + process.platform);
}

async function exercise(spec) {
  const answers = spec.answers, delay = spec.refresh_delay_ms;
  const bin = cli();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-attempt-gap-load-'));
  const arrivals = [], refreshes = [], faults = [];
  let child, server, guard, stdout = '', stderr = '', timedOut = false;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive: true});
    const expires = Math.floor(Date.now() / 1000) + (delay === undefined ? 3600 : -10);
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expires_at: expires}));
    server = http.createServer(async (req, res) => {
      try {
        let raw = ''; for await (const chunk of req) raw += chunk;
        const at = performance.now();
        if (req.method + ' ' + req.url === 'POST /api/accounts/oauth/token') {
          refreshes.push(at);
          assert.notEqual(delay, undefined, 'unexpected token refresh');
          await new Promise(resolve => setTimeout(resolve, delay));
          res.writeHead(200, {'Content-Type': 'application/json'});
          res.end(JSON.stringify({access_token: 'fresh-access-token', refresh_token: 'fresh-refresh-token', expires_in: 3600}));
          return;
        }
        assert.equal(req.method + ' ' + req.url, 'POST /v1/responses');
        JSON.parse(raw);
        const answer = answers[arrivals.length];
        arrivals.push(at);
        assert.ok(answer, 'unexpected request ' + arrivals.length + ': the script has ' + answers.length + ' answers');
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
    const origin = 'http://127.0.0.1:' + server.address().port;
    const task = {protocol: 'kogen-loop/v1', root, role: {provider: 'chatgpt', model: 'fixture-model', effort: 'medium', base_url: ''}, instructions: '', prompt: 'fixture task', tools: [], protected: [], excluded: [], terminal: [], deadline_seconds: 0, session: {dir: '', resume: false}, requires: []};
    const before = hostLoad();
    child = spawn(bin, ['run', '--task', '-'], {cwd: root, env: {HOME: home, TMPDIR: dir, PATH: process.env.PATH, KOGEN_PROVIDER_URL: origin, KOGEN_AUTH_URL: origin}});
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => { stderr += b; });
    child.stdin.on('error', () => {});
    const done = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', code => resolve(code)); });
    child.stdin.end(JSON.stringify(task));
    guard = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 40000);
    const exit = await done;
    const after = hostLoad();
    assert.equal(timedOut, false, 'the CLI did not end within the 40 s fixture guard: ' + stderr);
    assert.deepEqual(faults, [], 'fake provider faults');
    const events = stdout.trim() === '' ? [] : stdout.trim().split('\n').map(l => JSON.parse(l));
    const records = events.filter(e => e.type === 'request.attempt').map(e => e.record);
    return {
      exit,
      requests: arrivals.length,
      arrival_gaps_ms: arrivals.slice(1).map((t, i) => t - arrivals[i]),
      refreshes: refreshes.length,
      load_before: before,
      load_after: after,
      records: records.map(r => ({keys: Object.keys(r).sort(), outcome: r.outcome, timestamp: r.timestamp, wall_ms: r.wall_ms, request_offset_ms: r.request_offset_ms, load_average: r.load_average})),
      stderr,
    };
  } finally {
    clearTimeout(guard);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, {recursive: true, force: true});
  }
}

// The keys every attempt record carried before this change, by outcome, from the unchanged tree.
const before = {
  completed: [
    'attempt_id', 'cache', 'compatibility', 'configured_effort', 'configured_model', 'conversation_id',
    'effective_effort', 'effective_model', 'effective_reasoning_context', 'effective_service_tier',
    'end_reason', 'error', 'fingerprints', 'first_byte_ms', 'gap_hist', 'headers_ms', 'last_byte_ms',
    'last_progress_ms', 'max_gap_ms', 'operation_id', 'outcome', 'provider', 'provider_request_id',
    'provider_response_id', 'requested_reasoning_context', 'requested_service_tier', 'stream_bytes',
    'timestamp', 'ttft_ms', 'usage', 'usage_state', 'wall_ms',
  ],
  failed: [
    'attempt_id', 'cache', 'compatibility', 'configured_effort', 'configured_model', 'conversation_id',
    'effective_effort', 'effective_model', 'effective_reasoning_context', 'effective_service_tier',
    'end_reason', 'error', 'fingerprints', 'first_byte_ms', 'gap_hist', 'headers_ms', 'last_byte_ms',
    'last_progress_ms', 'max_gap_ms', 'operation_id', 'outcome', 'provider', 'provider_failure',
    'provider_request_id', 'provider_response_id', 'requested_reasoning_context', 'requested_service_tier',
    'stream_bytes', 'timestamp', 'ttft_ms', 'usage', 'usage_state', 'wall_ms',
  ],
};

function micros(ts) {
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)\.(\d{6})Z$/.exec(ts);
  assert.ok(m, 'attempt timestamp ' + JSON.stringify(ts) + ' is not the existing microsecond UTC format');
  return Date.parse(m[1] + 'Z') * 1000 + Number(m[2]);
}

function record(o, n) {
  const r = o.records[n - 1];
  assert.ok(r, 'no attempt record ' + n + ': ' + o.records.length + ' request.attempt events (CLI exit ' + o.exit + ', stderr: ' + o.stderr + ')');
  return r;
}

// The observer: each check names what it compared.
const checks = {
  attempts(o, n) {
    assert.equal(o.records.length, n, 'request.attempt events (CLI exit ' + o.exit + ', stderr: ' + o.stderr + ')');
    assert.equal(o.requests, n, 'fake provider requests');
  },
  refreshes(o, n) { assert.equal(o.refreshes, n, 'fake token refreshes'); },
  exit(o, code) { assert.equal(o.exit, code, 'CLI exit code (stderr: ' + o.stderr + ')'); },
  keys(o, n) {
    const r = record(o, n);
    assert.ok(before[r.outcome], 'attempt ' + n + ' outcome ' + JSON.stringify(r.outcome) + ' has no recorded key set');
    const want = [...before[r.outcome], 'load_average', 'request_offset_ms'].sort();
    assert.deepEqual(r.keys, want, 'attempt ' + n + ' record keys: the existing keys plus load_average and request_offset_ms');
  },
  offset(o, n, low, high) {
    const v = record(o, n).request_offset_ms;
    assert.ok(Number.isInteger(v), 'attempt ' + n + ' request_offset_ms is ' + JSON.stringify(v) + ', expected an integer number of milliseconds');
    assert.ok(v >= low && v < high, 'attempt ' + n + ' request_offset_ms is ' + v + ', expected at least ' + low + ' and under ' + high);
  },
  later(o, n, wait) {
    const p = record(o, n - 1), r = record(o, n);
    checks.offset(o, n - 1, 0, Infinity); checks.offset(o, n, 0, Infinity);
    const gap = r.request_offset_ms - p.request_offset_ms;
    const low = p.wall_ms + wait - 1;
    assert.ok(gap >= low, 'attempt ' + n + ' starts ' + gap + ' ms after attempt ' + (n - 1) + ' by request_offset_ms, expected at least its wall_ms ' + p.wall_ms + ' plus the ' + wait + ' ms wait, less 1 ms rounding');
    const stamps = (micros(r.timestamp) - micros(p.timestamp)) / 1000;
    assert.ok(Math.abs(gap - stamps) <= 1, 'attempt ' + n + ' request_offset_ms gap ' + gap + ' ms differs from its timestamp gap ' + stamps + ' ms by more than 1 ms');
    const arrival = o.arrival_gaps_ms[n - 2];
    assert.equal(typeof arrival, 'number', 'no fake provider arrival gap before request ' + n);
    assert.ok(Math.abs(gap - arrival) <= 300, 'attempt ' + n + ' request_offset_ms gap ' + gap + ' ms differs from the fake provider arrival gap ' + arrival.toFixed(1) + ' ms by more than 300 ms');
  },
  load(o, n) {
    const v = record(o, n).load_average;
    assert.ok(Array.isArray(v) && v.length === 3, 'attempt ' + n + ' load_average is ' + JSON.stringify(v) + ', expected an array of the 1, 5 and 15 minute load averages');
    const slack = [hi => 1 + 0.25 * hi, hi => 0.5 + 0.1 * hi, hi => 0.25 + 0.05 * hi];
    ['1', '5', '15'].forEach((m, i) => {
      const x = v[i];
      assert.ok(typeof x === 'number' && Number.isFinite(x) && x >= 0, 'attempt ' + n + ' ' + m + ' minute load ' + JSON.stringify(x) + ' is not a finite number of at least 0');
      assert.ok(Math.abs(x * 100 - Math.round(x * 100)) < 1e-6, 'attempt ' + n + ' ' + m + ' minute load ' + x + ' has more than two decimals');
      const lo = Math.min(o.load_before[i], o.load_after[i]), hi = Math.max(o.load_before[i], o.load_after[i]), d = slack[i](hi);
      assert.ok(x >= lo - d && x <= hi + d, 'attempt ' + n + ' ' + m + ' minute load ' + x + ' is outside the host readings ' + o.load_before[i] + ' (before) and ' + o.load_after[i] + ' (after) by more than ' + d.toFixed(2));
    });
  },
};

// Known-good observations recorded from a reference implementation's CLI runs, and known-bad
// variants of them, for the checks above (no CLI, no network).
function controls(kind) {
  const keys = outcome => [...before[outcome], 'load_average', 'request_offset_ms'].sort();
  const good = {
    single: {exit: 0, requests: 1, arrival_gaps_ms: [], refreshes: 0, load_before: [9.82, 8.26, 7.69], load_after: [9.82, 8.26, 7.69], stderr: '',
      records: [{keys: keys('completed'), outcome: 'completed', timestamp: '2026-11-03T06:57:05.542723Z', wall_ms: 4, request_offset_ms: 0, load_average: [9.82, 8.26, 7.69]}]},
    refresh: {exit: 0, requests: 1, arrival_gaps_ms: [], refreshes: 1, load_before: [9.82, 8.26, 7.69], load_after: [10, 8.32, 7.71], stderr: '',
      records: [{keys: keys('completed'), outcome: 'completed', timestamp: '2026-11-03T06:57:07.949571Z', wall_ms: 0, request_offset_ms: 1516, load_average: [10, 8.32, 7.71]}]},
    retry: {exit: 0, requests: 2, arrival_gaps_ms: [1004.6654589999999], refreshes: 0, load_before: [10, 8.32, 7.71], load_after: [10, 8.32, 7.71], stderr: '',
      records: [
        {keys: keys('failed'), outcome: 'failed', timestamp: '2026-11-03T06:57:08.805630Z', wall_ms: 5, request_offset_ms: 0, load_average: [10, 8.32, 7.71]},
        {keys: keys('completed'), outcome: 'completed', timestamp: '2026-11-03T06:57:09.812268Z', wall_ms: 2, request_offset_ms: 1006, load_average: [10, 8.32, 7.71]},
      ]},
  };
  const judge = {
    single: o => { checks.attempts(o, 1); checks.refreshes(o, 0); checks.exit(o, 0); checks.keys(o, 1); checks.offset(o, 1, 0, 1000); checks.load(o, 1); },
    refresh: o => { checks.attempts(o, 1); checks.refreshes(o, 1); checks.exit(o, 0); checks.keys(o, 1); checks.offset(o, 1, 1450, 4500); checks.load(o, 1); },
    retry: o => {
      checks.attempts(o, 2); checks.refreshes(o, 0); checks.exit(o, 0); checks.keys(o, 1); checks.keys(o, 2);
      checks.offset(o, 1, 0, 1000); checks.offset(o, 2, 1000, 3000); checks.later(o, 2, 1000); checks.load(o, 1); checks.load(o, 2);
    },
  };
  for (const [name, o] of Object.entries(good)) judge[name](o);
  if (kind === 'good') { process.stdout.write('attempt gap and load observer accepted\n'); return; }
  const old = outcome => before[outcome].slice();
  const bad = [
    ['single', o => { o.records[0].keys = old('completed'); delete o.records[0].request_offset_ms; delete o.records[0].load_average; }],
    ['single', o => { o.records[0].keys = o.records[0].keys.filter(k => k !== 'wall_ms'); }],
    ['single', o => { o.records[0].keys = [...o.records[0].keys, 'host_load'].sort(); }],
    ['single', o => { o.records[0].request_offset_ms = 0.5; }],
    ['single', o => { o.records[0].request_offset_ms = '0'; }],
    ['single', o => { o.records[0].request_offset_ms = -1; }],
    ['single', o => { o.records[0].load_average = null; }],
    ['single', o => { o.records[0].load_average = [0, 0, 0]; }],
    ['single', o => { o.records[0].load_average = [9.82, 8.26]; }],
    ['single', o => { o.records[0].load_average = [9.823, 8.26, 7.69]; }],
    ['single', o => { o.records[0].load_average = {'1m': 9.82, '5m': 8.26, '15m': 7.69}; }],
    ['single', o => { o.exit = 1; }],
    ['single', o => { o.records = []; }],
    ['refresh', o => { o.records[0].request_offset_ms = 0; }],
    ['refresh', o => { o.refreshes = 0; }],
    ['refresh', o => { o.records[0].load_average = [7.71, 8.32, 10]; }],
    ['retry', o => { o.records[1].request_offset_ms = 0; }],
    ['retry', o => { o.records[1].request_offset_ms = 1003; }],
    ['retry', o => { o.records[1].request_offset_ms = 1009; }],
    ['retry', o => { o.records[1].timestamp = '2026-11-03T06:57:09.900000Z'; }],
    ['retry', o => { o.arrival_gaps_ms = [1500]; }],
    ['retry', o => { o.records[0].keys = keys('completed'); }],
    ['retry', o => { o.records.pop(); }],
    ['retry', o => { o.requests = 3; }],
    ['retry', o => { o.records[1].load_average = null; }],
  ];
  for (const [i, [name, mutate]] of bad.entries()) {
    const o = structuredClone(good[name]); mutate(o);
    let rejected = false; try { judge[name](o); } catch (_) { rejected = true; }
    if (!rejected) { process.stdout.write('attempt gap and load observer accepted bad observation ' + i + '\n'); process.exitCode = 3; return; }
  }
  process.stdout.write('attempt gap and load observer rejected\n'); process.exitCode = 1;
}

if (require.main === module) {
  if (process.argv[2] === '--control') controls(process.argv[3]);
  else if (process.argv[2] === '--run') {
    exercise(JSON.parse(process.argv[3])).then(o => console.log(JSON.stringify(o)), e => { console.error(e.stack); process.exitCode = 2; }).finally(cleanup);
  }
} else {
  const {When, Then, AfterAll} = require('@cucumber/cucumber');
  When('the CLI makes one request to a fake ChatGPT answering:', {timeout: 180000}, async function (text) { this.gap = await exercise(JSON.parse(text)); });
  Then('the run made {int} attempt(s) and {int} token refresh(es)', function (n, m) { checks.attempts(this.gap, n); checks.refreshes(this.gap, m); });
  Then('the gap run exited with code {int}', function (code) { checks.exit(this.gap, code); });
  Then('attempt {int} record has its existing keys plus load_average and request_offset_ms', function (n) { checks.keys(this.gap, n); });
  Then('attempt {int} started at least {int} and under {int} ms after the request started', function (n, low, high) { checks.offset(this.gap, n, low, high); });
  Then('attempt {int} started after attempt {int} ended and a {int} ms wait, by its request offset and its timestamp', function (n, p, wait) { assert.equal(p, n - 1, 'compare consecutive attempts'); checks.later(this.gap, n, wait); });
  Then('attempt {int} carries the host load average at its start', function (n) { checks.load(this.gap, n); });
  AfterAll(cleanup);
}
