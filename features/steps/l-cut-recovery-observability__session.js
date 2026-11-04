'use strict';
// Acceptance driver of l-cut-recovery-observability: it builds the real CLI, runs it against a
// local scripted Responses provider that answers one read_file call per request and then
// finish, and observes the tool.call and tool.result events on stdout and the
// function_call_output texts the later requests carry to the model.
// `node features/steps/l-cut-recovery-observability__session.js --control good|bad` checks the
// observer on synthetic event streams built from EXPECTED.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

// FILES are the fixture files: line i of each, without its number.
const FILES = {
  'big.txt': {count:600, line:i => `big row ${i} ${'b'.repeat(30)} secret-big-${i}`},
  'other.txt': {count:600, line:i => `other row ${i} ${'o'.repeat(28)} secret-other-${i}`},
  'small.txt': {count:5, line:i => `small row ${i} secret-small-${i}`},
};
const content = name => Array.from({length:FILES[name].count}, (_, i) => FILES[name].line(i + 1)).join('\n') + '\n';
// numbered is lines a..b of a fixture file as read_file shows them.
function numbered(name, a, b) {
  const f = FILES[name];
  assert.ok(f && a >= 1 && b >= a && b <= f.count, 'fixture range ' + JSON.stringify([name, a, b]));
  const out = [];
  for (let i = a; i <= b; i++) out.push(i + '\t' + f.line(i));
  return out.join('\n');
}
// render is the exact text of an output spec: one numbered range, or two around a cut marker.
function render(spec) {
  const parts = spec.lines.map(([a, b]) => numbered(spec.file, a, b));
  if (spec.marker) {
    assert.equal(parts.length, 2, 'a cut output spec has two line ranges');
    return parts[0] + '\n\n' + spec.marker + '\n' + parts[1];
  }
  assert.equal(parts.length, 1, 'an uncut output spec has one line range');
  return parts[0];
}
// CALLS are the scripted model's read_file calls, one per request: [call_id, arguments].
const CALLS = {
  recovery: [
    ['c-cut', {path:'big.txt'}],
    ['c-recover', {path:'./big.txt', start_line:100, end_line:109}],
    ['c-straddle', {path:'big.txt', start_line:400, end_line:405}],
  ],
  unrelated: [
    ['c-cut', {path:'big.txt'}],
    ['c-other', {path:'other.txt', start_line:100, end_line:109}],
    ['c-before', {path:'big.txt', start_line:60, end_line:69}],
    ['c-after', {path:'big.txt', start_line:404, end_line:410}],
    ['c-small', {path:'small.txt'}],
    ['c-small-again', {path:'small.txt', start_line:2, end_line:3}],
  ],
};
const CUT_SPEC = {file:'big.txt', lines:[[1, 69], [404, 600]], marker:'[... 334 lines (70-403), 20618 bytes omitted ...]'};
// EXPECTED repeats the feature's expectations for the observer controls (--control good|bad).
const EXPECTED = {
  recovery: {
    outputs:{'c-cut':CUT_SPEC, 'c-recover':{file:'big.txt', lines:[[100, 109]]}, 'c-straddle':{file:'big.txt', lines:[[400, 405]]}},
    tools:{callEvents:{'c-cut':{}, 'c-recover':{}, 'c-straddle':{}, end:{}},
      results:{'c-cut':{omitted_lines:[70, 403]}, 'c-recover':{recovers:[{call_id:'c-cut', lines:10}]}, 'c-straddle':{recovers:[{call_id:'c-cut', lines:4}]}},
      cut:{'c-cut':true, 'c-recover':false, 'c-straddle':false}},
  },
  unrelated: {
    outputs:{'c-cut':CUT_SPEC, 'c-other':{file:'other.txt', lines:[[100, 109]]}, 'c-before':{file:'big.txt', lines:[[60, 69]]},
      'c-after':{file:'big.txt', lines:[[404, 410]]}, 'c-small':{file:'small.txt', lines:[[1, 5]]}, 'c-small-again':{file:'small.txt', lines:[[2, 3]]}},
    tools:{callEvents:{'c-cut':{}, 'c-other':{}, 'c-before':{}, 'c-after':{}, 'c-small':{}, 'c-small-again':{}, end:{}},
      results:{'c-cut':{omitted_lines:[70, 403]}, 'c-other':{}, 'c-before':{}, 'c-after':{}, 'c-small':{}, 'c-small-again':{}},
      cut:{'c-cut':true, 'c-other':false, 'c-before':false, 'c-after':false, 'c-small':false, 'c-small-again':false}},
  },
};
// leaks are texts that must not appear anywhere on stdout: file contents, file paths, the
// line-range argument names and every raw arguments string, as written and JSON-escaped.
function leaks(mode) {
  const raw = CALLS[mode].map(([, args]) => JSON.stringify(args));
  return ['secret-big-', 'secret-other-', 'secret-small-', 'big row ', 'other row ', 'small row ',
    'big.txt', 'other.txt', 'small.txt', 'start_line', 'end_line', ...raw, ...raw.map(s => JSON.stringify(s).slice(1, -1))];
}
const envelope = ['protocol', 'seq', 'time', 'type'];
// extras are an event's fields beyond the envelope and the given existing fields.
const extras = (e, base) => Object.fromEntries(Object.entries(e).filter(([k]) => ![...envelope, ...base].includes(k)));
// summarize turns the CLI's stdout, the outputs the model received and the exit code into an
// observation. Only tool.call and tool.result events are compared field by field; every other
// existing event field (usage.output token counts included) is only searched for leaked text.
function summarize(mode, stdout, outputs, exit) {
  const events = stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
  const callEvents = {}, results = {}, cut = {};
  for (const e of events) {
    if (e.type === 'tool.call') callEvents[e.call_id] = extras(e, ['call_id', 'name', 'arguments_sha256']);
    if (e.type === 'tool.result') {
      results[e.call_id] = extras(e, ['call_id', 'name', 'result_sha256', 'bytes', 'cut']);
      cut[e.call_id] = e.cut;
    }
  }
  const ended = events.find(e => e.type === 'round.ended');
  return {
    exit, ending:ended ? ended.ending : null, terminal:ended ? ended.terminal_tool : null,
    errors:events.filter(e => e.type === 'error').map(e => ({class:e.class, reason:e.reason, detail:e.detail})),
    logged:leaks(mode).filter(t => stdout.includes(t)), tools:{callEvents, results, cut}, outputs,
  };
}
function checkEnd(obs) {
  assert.deepEqual({exit:obs.exit, ending:obs.ending, terminal:obs.terminal, errors:obs.errors}, {exit:0, ending:'terminal', terminal:'finish', errors:[]}, 'session end');
}
function checkOutputs(obs, specs) {
  assert.deepEqual(Object.keys(obs.outputs).sort(), Object.keys(specs).sort(), 'call ids whose outputs the model received');
  for (const [id, spec] of Object.entries(specs)) {
    const got = obs.outputs[id], want = render(spec);
    assert.ok(got === want, `output delivered to the model for ${id} differs from ${JSON.stringify(spec)}: got ${JSON.stringify(got).slice(0, 400)}`);
  }
}
function checkLeaks(obs) {
  assert.deepEqual(obs.logged, [], 'texts the event stream must not carry');
}
function checkTools(obs, want) {
  assert.deepEqual(obs.tools, want, 'fields tool.call and tool.result events add: ' + JSON.stringify(obs.tools));
}
const verify = (obs, want) => { checkEnd(obs); checkOutputs(obs, want.outputs); checkLeaks(obs); checkTools(obs, want.tools); };

let built;
function binary() {
  if (!built) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-cut-recovery-observability-bin-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true, force:true}));
    const bin = path.join(dir, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', bin, './cmd/kogen-loop'], {encoding:'utf8', timeout:150000});
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr + (build.error || ''));
    built = bin;
  }
  return built;
}
const USAGE = {input_tokens:3, input_tokens_details:{cached_tokens:0}, output_tokens:3, output_tokens_details:{reasoning_tokens:0}};
// run runs the built CLI once against the scripted provider: request k answers the k-th call
// of CALLS[mode], the request after the last call answers finish.
async function run(mode) {
  assert.ok(CALLS[mode], 'unknown scripted session ' + mode);
  const bin = binary();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'l-cut-recovery-observability-')));
  let server, child, timer, failure;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    for (const name of Object.keys(FILES)) fs.writeFileSync(path.join(root, name), content(name));
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive:true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now() / 1000) + 3600}));
    const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''}, instructions:'', prompt:'fixture task', tools:['read_file'], protected:[], excluded:[], terminal:['finish'], deadline_seconds:0, session:{dir:'', resume:false}, requires:[]};
    const calls = CALLS[mode], outputs = {};
    let requests = 0;
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/v1/responses');
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const n = ++requests;
        assert.ok(n <= calls.length + 1, 'scripted session request count ' + n);
        for (const x of body.input || []) if (x.type === 'function_call_output') outputs[x.call_id] = x.output;
        const item = n <= calls.length
          ? {type:'function_call', call_id:calls[n - 1][0], name:'read_file', arguments:JSON.stringify(calls[n - 1][1])}
          : {type:'function_call', call_id:'end', name:'finish', arguments:JSON.stringify({summary:'done'})};
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        res.write('data: ' + JSON.stringify({type:'response.output_item.done', output_index:0, item}) + '\n\n');
        res.end('data: ' + JSON.stringify({type:'response.completed', response:{id:'resp-' + n, status:'completed', usage:USAGE}}) + '\n\n');
      } catch (e) { failure = failure || e; res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:e.message}})); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let stdout = '', stderr = '';
    const env = {HOME:home, TMPDIR:os.tmpdir(), PATH:process.env.PATH, KOGEN_PROVIDER_URL:'http://127.0.0.1:' + server.address().port};
    child = spawn(bin, ['run', '--task', '-'], {cwd:root, env});
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
    child.stdin.end(JSON.stringify(task));
    let timedOut = false;
    timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 60000);
    const exit = await closed;
    if (failure) throw failure;
    assert.equal(timedOut, false, 'CLI did not finish within 60 s: ' + stderr);
    assert.equal(requests, calls.length + 1, 'scripted session requests; stderr: ' + stderr);
    return summarize(mode, stdout, outputs, exit);
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, {recursive:true, force:true});
  }
}

// stream is a synthetic CLI stdout that carries exactly what want expects, with the existing
// response usage (its "output" token count included) and attempt records.
function stream(mode, want) {
  const usage = {input:3, cached:0, output:3, reasoning:0, state:'complete', source:'provider'};
  const lines = [{type:'session.started', session_id:'s', resumed:false, role:{}, capabilities_digest:'0'.repeat(64)}];
  const ids = Object.keys(want.tools.callEvents);
  ids.forEach((id, i) => {
    lines.push({type:'request.started', n:i + 1, owner:'loop', model:'fixture-model', effort:'medium'},
      {type:'request.attempt', n:i + 1, record:{outcome:'completed'}}, {type:'response', n:i + 1, response_id:'resp-' + (i + 1), usage},
      {type:'tool.call', call_id:id, name:id === 'end' ? 'finish' : 'read_file', arguments_sha256:'0'.repeat(64), ...want.tools.callEvents[id]});
    if (want.tools.results[id]) lines.push({type:'tool.result', call_id:id, name:'read_file', result_sha256:'0'.repeat(64), bytes:1, cut:want.tools.cut[id], ...want.tools.results[id]});
  });
  lines.push({type:'round.ended', ending:'terminal', terminal_tool:'finish', claim:'{"summary":"done"}', requests:ids.length, usage},
    {type:'session.ended', status:'ended', exit:0});
  return lines.map((l, i) => JSON.stringify({protocol:'kogen-loop/v1', seq:i + 1, time:'2026-11-04T00:00:00Z', ...l})).join('\n') + '\n';
}
const rendered = want => Object.fromEntries(Object.entries(want.outputs).map(([id, spec]) => [id, render(spec)]));
// edit is stdout with fn applied to its parsed lines.
const edit = (stdout, fn) => stdout.trim().split('\n').map(s => JSON.parse(s)).flatMap(e => fn(e) || [e]).map(e => JSON.stringify(e)).join('\n') + '\n';
const onResult = (id, fn) => e => (e.type === 'tool.result' && e.call_id === id ? [fn(e)] : null);
// mutations are wrong CLI streams, each of which the observer must reject.
function mutations(mode, want) {
  const good = stream(mode, want), out = [];
  for (const [id, has] of Object.entries(want.tools.results)) {
    for (const key of Object.keys(has)) out.push(['drop ' + key + ' of ' + id, edit(good, onResult(id, e => { const c = {...e}; delete c[key]; return c; }))]);
    if (has.omitted_lines) out.push(['shift omitted_lines of ' + id, edit(good, onResult(id, e => ({...e, omitted_lines:[70, 404]})))]);
    if (has.recovers) {
      out.push(['change recovered lines of ' + id, edit(good, onResult(id, e => ({...e, recovers:[{...e.recovers[0], lines:e.recovers[0].lines + 1}]})))]);
      out.push(['tie ' + id + ' to another call', edit(good, onResult(id, e => ({...e, recovers:[{...e.recovers[0], call_id:id}]})))]);
      out.push(['add raw arguments to the recovery of ' + id, edit(good, onResult(id, e => ({...e, recovers:[{...e.recovers[0], start_line:100}]})))]);
    } else if (!has.omitted_lines) {
      out.push(['report ' + id + ' as a recovery', edit(good, onResult(id, e => ({...e, recovers:[{call_id:'c-cut', lines:1}]})))]);
      out.push(['report ' + id + ' as cut lines', edit(good, onResult(id, e => ({...e, omitted_lines:[1, 1]})))]);
    }
    out.push(['add a tool output payload to ' + id, edit(good, onResult(id, e => ({...e, output:'(redacted)'})))]);
  }
  out.push(['mark c-cut uncut', edit(good, onResult('c-cut', e => ({...e, cut:false})))]);
  out.push(['add a field to tool.call c-cut', edit(good, e => (e.type === 'tool.call' && e.call_id === 'c-cut' ? [{...e, start:100}] : null))]);
  out.push(['log file contents', edit(good, e => (e.type === 'session.started' ? [{...e, note:'secret-big-100'}] : null))]);
  out.push(['log a file path', edit(good, e => (e.type === 'round.ended' ? [{...e, claim:'{"summary":"big.txt"}'}] : null))]);
  out.push(['log raw arguments', edit(good, e => (e.type === 'request.attempt' && e.n === 1 ? [{...e, record:{outcome:'completed', note:JSON.stringify(CALLS[mode][0][1])}}] : null))]);
  out.push(['end without a terminal call', edit(good, e => (e.type === 'round.ended' ? [{...e, ending:'no_call', terminal_tool:null}] : null))]);
  out.push(['emit an error event', good + JSON.stringify({protocol:'kogen-loop/v1', seq:99, time:'2026-11-04T00:00:00Z', type:'error', class:'loop', reason:'failed', detail:'x'}) + '\n']);
  return out;
}

if (require.main === module) {
  if (process.argv[2] === '--control' && process.argv[3] === 'good') {
    for (const [mode, want] of Object.entries(EXPECTED)) {
      const good = stream(mode, want);
      assert.ok(good.includes('"output":3'), 'the good stream carries the existing usage.output token count');
      verify(summarize(mode, good, rendered(want), 0), want);
    }
    console.log('cut recovery observer accepted');
  } else if (process.argv[2] === '--control' && process.argv[3] === 'bad') {
    for (const [mode, want] of Object.entries(EXPECTED)) {
      const outputs = rendered(want);
      for (const [label, stdout] of mutations(mode, want)) {
        assert.throws(() => verify(summarize(mode, stdout, outputs, 0), want), undefined, mode + ' must reject: ' + label);
      }
      for (const id of Object.keys(outputs)) {
        assert.throws(() => verify(summarize(mode, stream(mode, want), {...outputs, [id]:outputs[id] + 'x'}, 0), want), undefined, mode + ' must reject a changed output of ' + id);
        const fewer = {...outputs}; delete fewer[id];
        assert.throws(() => verify(summarize(mode, stream(mode, want), fewer, 0), want), undefined, mode + ' must reject a missing output of ' + id);
      }
      assert.throws(() => verify(summarize(mode, stream(mode, want), outputs, 1), want), undefined, mode + ' must reject exit 1');
    }
    console.log('cut recovery observer rejected'); process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  const P = 'l-cut-recovery-observability: ';
  When(P + 'I run the scripted session {string}', {timeout:240000}, async function (mode) { this.cutRecovery = await run(mode); });
  Then(P + 'the session ends with the finish call and exit code 0', function () { checkEnd(this.cutRecovery); });
  Then(P + 'the outputs delivered to the model are:', function (text) { checkOutputs(this.cutRecovery, JSON.parse(text)); });
  Then(P + 'the event stream carries no file contents, file paths or raw call arguments', function () { checkLeaks(this.cutRecovery); });
  Then(P + 'the tool events add exactly:', function (text) { checkTools(this.cutRecovery, JSON.parse(text)); });
}
