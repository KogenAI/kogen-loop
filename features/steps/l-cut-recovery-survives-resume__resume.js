'use strict';
// Acceptance driver of l-cut-recovery-survives-resume: it builds the real CLI and runs a scripted
// session of several rounds, each round one `kogen-loop run` process with session.dir (the first
// new, later ones resume: true), against a local scripted Responses provider that answers one
// read_file call per request and then finish. It observes each round's stdout events, the raw
// request bodies the model received and session.json after each round.
// `node features/steps/l-cut-recovery-survives-resume__resume.js --control good|bad` checks the
// observer on synthetic observations built from EXPECTED.
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
// SESSIONS are the scripted model's read_file calls: one list per round, one call per request
// ([call_id, arguments]); the request after a round's last call answers finish "end-<round>".
const SESSIONS = {
  resumed: [
    [['c-cut', {path:'big.txt'}]],
    [['c-straddle', {path:'big.txt', start_line:400, end_line:405}], ['c-recover', {path:'./big.txt', start_line:100, end_line:109}], ['c-cut-2', {path:'big.txt'}]],
    [['c-both', {path:'big.txt', start_line:400, end_line:405}]],
  ],
  unrelated: [
    [['c-cut', {path:'big.txt'}]],
    [['c-other', {path:'other.txt', start_line:100, end_line:109}], ['c-before', {path:'big.txt', start_line:60, end_line:69}], ['c-after', {path:'big.txt', start_line:404, end_line:410}]],
  ],
  'old-format': [
    [['c-cut', {path:'big.txt'}]],
    [['c-straddle', {path:'big.txt', start_line:400, end_line:405}]],
  ],
};
const readIds = name => SESSIONS[name].flat().map(([id]) => id);
const CUT_SPEC = {file:'big.txt', lines:[[1, 69], [404, 600]], marker:'[... 334 lines (70-403), 20618 bytes omitted ...]'};
const R1 = {call_id:'c-cut', file:'big.txt', from:70, to:403}, R2 = {call_id:'c-cut-2', file:'big.txt', from:70, to:403};
// EXPECTED repeats the feature's expectations for the observer controls (--control good|bad).
const EXPECTED = {
  resumed: {
    strip:false,
    outputs:{'c-cut':CUT_SPEC, 'c-straddle':{file:'big.txt', lines:[[400, 405]]}, 'c-recover':{file:'big.txt', lines:[[100, 109]]}, 'c-cut-2':CUT_SPEC, 'c-both':{file:'big.txt', lines:[[400, 405]]}},
    records:[[R1], [R1, R2], [R1, R2]],
    tools:[
      {callEvents:{'c-cut':{}, 'end-1':{}}, results:{'c-cut':{omitted_lines:[70, 403]}}, cut:{'c-cut':true}},
      {callEvents:{'c-straddle':{}, 'c-recover':{}, 'c-cut-2':{}, 'end-2':{}},
        results:{'c-straddle':{recovers:[{call_id:'c-cut', lines:4}]}, 'c-recover':{recovers:[{call_id:'c-cut', lines:10}]}, 'c-cut-2':{omitted_lines:[70, 403]}},
        cut:{'c-straddle':false, 'c-recover':false, 'c-cut-2':true}},
      {callEvents:{'c-both':{}, 'end-3':{}}, results:{'c-both':{recovers:[{call_id:'c-cut', lines:4}, {call_id:'c-cut-2', lines:4}]}}, cut:{'c-both':false}},
    ],
  },
  unrelated: {
    strip:false,
    outputs:{'c-cut':CUT_SPEC, 'c-other':{file:'other.txt', lines:[[100, 109]]}, 'c-before':{file:'big.txt', lines:[[60, 69]]}, 'c-after':{file:'big.txt', lines:[[404, 410]]}},
    records:[[R1], [R1]],
    tools:[
      {callEvents:{'c-cut':{}, 'end-1':{}}, results:{'c-cut':{omitted_lines:[70, 403]}}, cut:{'c-cut':true}},
      {callEvents:{'c-other':{}, 'c-before':{}, 'c-after':{}, 'end-2':{}}, results:{'c-other':{}, 'c-before':{}, 'c-after':{}}, cut:{'c-other':false, 'c-before':false, 'c-after':false}},
    ],
  },
  'old-format': {
    strip:true,
    outputs:{'c-cut':CUT_SPEC, 'c-straddle':{file:'big.txt', lines:[[400, 405]]}},
    records:[[R1], []],
    tools:[
      {callEvents:{'c-cut':{}, 'end-1':{}}, results:{'c-cut':{omitted_lines:[70, 403]}}, cut:{'c-cut':true}},
      {callEvents:{'c-straddle':{}, 'end-2':{}}, results:{'c-straddle':{}}, cut:{'c-straddle':false}},
    ],
  },
};
// leaks are texts that must not appear on any round's stdout: file contents, file paths, the
// line-range argument names and every raw arguments string, as written and JSON-escaped.
function leaks(name) {
  const raw = SESSIONS[name].flat().map(([, args]) => JSON.stringify(args));
  return ['secret-big-', 'secret-other-', 'big row ', 'other row ', 'big.txt', 'other.txt', 'start_line', 'end_line',
    ...raw, ...raw.map(s => JSON.stringify(s).slice(1, -1))];
}
// TRANSCRIPT_KEYS are the existing session.json keys, in the order the CLI writes them.
const TRANSCRIPT_KEYS = ['protocol', 'session_id', 'role', 'instructions_sha256', 'definitions_sha256', 'terminal', 'input'];
const RECORDS_KEY = ',"cut_reads":';
const envelope = ['protocol', 'seq', 'time', 'type'];
const extras = (e, base) => Object.fromEntries(Object.entries(e).filter(([k]) => ![...envelope, ...base].includes(k)));
const events = stdout => stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
const sessionId = round => { const s = events(round.stdout).find(e => e.type === 'session.started'); return s ? s.session_id : null; };

// An observation is {name, strip, rounds:[{exit, stdout, bodies:[raw request body], saved:raw
// session.json after the round or null, root, dir}]}; the checks below judge it.
function checkEnd(obs) {
  const got = obs.rounds.map(r => {
    const es = events(r.stdout), ended = es.find(e => e.type === 'round.ended'), started = es.find(e => e.type === 'session.started');
    return {exit:r.exit, resumed:started ? started.resumed : null, ending:ended ? ended.ending : null, terminal:ended ? ended.terminal_tool : null,
      errors:es.filter(e => e.type === 'error').map(e => ({class:e.class, reason:e.reason, detail:e.detail}))};
  });
  const want = obs.rounds.map((r, i) => ({exit:0, resumed:i > 0, ending:'terminal', terminal:'finish', errors:[]}));
  assert.deepEqual(got, want, 'each round ends with its finish call and exit code 0, every round after the first resumed');
  const ids = obs.rounds.map(sessionId);
  assert.ok(ids[0] && ids.every(id => id === ids[0]), 'every round continues one session: ' + JSON.stringify(ids));
}
function checkOutputs(obs, specs) {
  const ids = readIds(obs.name), seen = {};
  for (const r of obs.rounds) for (const raw of r.bodies) {
    for (const x of JSON.parse(raw).input || []) {
      if (x.type !== 'function_call_output' || !ids.includes(x.call_id)) continue;
      (seen[x.call_id] = seen[x.call_id] || new Set()).add(x.output);
    }
  }
  assert.deepEqual(Object.keys(seen).sort(), Object.keys(specs).sort(), 'call ids whose outputs the model received');
  for (const [id, spec] of Object.entries(specs)) {
    const got = [...seen[id]], want = render(spec);
    assert.ok(got.length === 1 && got[0] === want, `outputs delivered to the model for ${id} differ from ${JSON.stringify(spec)}: got ${JSON.stringify(got).slice(0, 400)}`);
  }
}
function checkLeaks(obs) {
  const all = obs.rounds.map(r => r.stdout).join('');
  assert.deepEqual(leaks(obs.name).filter(t => all.includes(t)), [], 'texts the event streams must not carry');
}
// withoutRecords is a saved session.json with its trailing cut_reads member removed.
function withoutRecords(raw) {
  const i = raw.indexOf(RECORDS_KEY);
  if (i < 0) return raw;
  let last = raw.endsWith(']}\n');
  if (last) try { JSON.parse(raw.slice(i + RECORDS_KEY.length, -2)); } catch { last = false; }
  assert.ok(last, 'cut_reads is the last member of session.json: ' + raw.slice(i, i + 200));
  return raw.slice(0, i) + '}\n';
}
// normalized replaces the run-specific session id, root and session directory.
function normalized(text, round) {
  let out = text;
  for (const [s, t] of [[sessionId(round), 'SESSION'], [round.dir, 'DIR'], [round.root, 'ROOT']]) if (s) out = out.split(s).join(t);
  return out;
}
function checkSameAsWithout(obs, other) {
  assert.equal(other.rounds.length, obs.rounds.length, 'rounds of the run without saved records');
  obs.rounds.forEach((r, i) => {
    const o = other.rounds[i];
    assert.deepEqual(r.bodies.map(b => normalized(b, r)), o.bodies.map(b => normalized(b, o)), `round ${i + 1}: request bodies differ from the same round without saved records`);
    assert.ok(r.saved !== null && o.saved !== null, `round ${i + 1}: session.json was written`);
    assert.equal(normalized(withoutRecords(r.saved), r), normalized(withoutRecords(o.saved), o), `round ${i + 1}: session.json without cut_reads differs from the same round without saved records`);
  });
}
function checkRecords(obs, want) {
  assert.equal(obs.rounds.length, want.length, 'rounds whose saved records are expected');
  obs.rounds.forEach((r, i) => {
    assert.ok(r.saved !== null, `round ${i + 1}: session.json was written`);
    const t = JSON.parse(r.saved);
    const keys = want[i].length ? [...TRANSCRIPT_KEYS, 'cut_reads'] : TRANSCRIPT_KEYS;
    assert.deepEqual(Object.keys(t), keys, `round ${i + 1}: session.json members in order`);
    assert.deepEqual(t.cut_reads || [], want[i], `round ${i + 1}: cut_reads saved in session.json: ${JSON.stringify(t.cut_reads)}`);
  });
}
function checkTools(obs, want) {
  const got = obs.rounds.map(r => {
    const callEvents = {}, results = {}, cut = {};
    for (const e of events(r.stdout)) {
      if (e.type === 'tool.call') callEvents[e.call_id] = extras(e, ['call_id', 'name', 'arguments_sha256']);
      if (e.type === 'tool.result') {
        results[e.call_id] = extras(e, ['call_id', 'name', 'result_sha256', 'bytes', 'cut']);
        cut[e.call_id] = e.cut;
      }
    }
    return {callEvents, results, cut};
  });
  assert.deepEqual(got, want, 'fields tool.call and tool.result events add, per round: ' + JSON.stringify(got));
}
const verify = (obs, want, other) => {
  checkEnd(obs); checkOutputs(obs, want.outputs); checkLeaks(obs);
  if (other) checkSameAsWithout(obs, other);
  checkRecords(obs, want.records); checkTools(obs, want.tools);
};

let built;
function binary() {
  if (!built) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-cut-recovery-survives-resume-bin-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true, force:true}));
    const bin = path.join(dir, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', bin, './cmd/kogen-loop'], {encoding:'utf8', timeout:150000});
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr + (build.error || ''));
    built = bin;
  }
  return built;
}
const USAGE = {input_tokens:3, input_tokens_details:{cached_tokens:0}, output_tokens:3, output_tokens_details:{reasoning_tokens:0}};
// run runs every round of SESSIONS[name] as its own CLI process with one session directory. With
// strip, the cut_reads member is removed from session.json before every resume (the format
// written before saved records existed).
async function run(name, strip) {
  assert.ok(SESSIONS[name], 'unknown scripted session ' + name);
  const bin = binary();
  const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'l-cut-recovery-survives-resume-')));
  let server, child, timer, failure;
  try {
    const root = path.join(tmp, 'root'); fs.mkdirSync(root);
    for (const file of Object.keys(FILES)) fs.writeFileSync(path.join(root, file), content(file));
    const dir = path.join(tmp, 'session'), saved = path.join(dir, 'session.json');
    const home = path.join(tmp, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive:true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now() / 1000) + 3600}));
    let calls = [], bodies = [], round = 0;
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/v1/responses');
        let raw = ''; for await (const chunk of req) raw += chunk;
        bodies.push(raw);
        const n = bodies.length;
        assert.ok(n <= calls.length + 1, `round ${round} scripted request count ${n}`);
        const item = n <= calls.length
          ? {type:'function_call', call_id:calls[n - 1][0], name:'read_file', arguments:JSON.stringify(calls[n - 1][1])}
          : {type:'function_call', call_id:'end-' + round, name:'finish', arguments:JSON.stringify({summary:'done ' + round})};
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        res.write('data: ' + JSON.stringify({type:'response.output_item.done', output_index:0, item}) + '\n\n');
        res.end('data: ' + JSON.stringify({type:'response.completed', response:{id:`resp-${round}-${n}`, status:'completed', usage:USAGE}}) + '\n\n');
      } catch (e) { failure = failure || e; res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:e.message}})); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const env = {HOME:home, TMPDIR:os.tmpdir(), PATH:process.env.PATH, KOGEN_PROVIDER_URL:'http://127.0.0.1:' + server.address().port};
    const rounds = [];
    for (const [i, roundCalls] of SESSIONS[name].entries()) {
      round = i + 1; calls = roundCalls; bodies = [];
      if (i > 0 && strip) {
        const t = JSON.parse(fs.readFileSync(saved, 'utf8'));
        delete t.cut_reads;
        fs.writeFileSync(saved, JSON.stringify(t) + '\n', {mode:0o600});
      }
      const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''}, instructions:'',
        prompt:i === 0 ? 'fixture task' : 'fixture feedback ' + round, tools:['read_file'], protected:[], excluded:[], terminal:['finish'],
        deadline_seconds:0, session:{dir, resume:i > 0}, requires:[]};
      let stdout = '', stderr = '';
      child = spawn(bin, ['run', '--task', '-'], {cwd:root, env});
      child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
      const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
      child.stdin.end(JSON.stringify(task));
      let timedOut = false;
      timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 60000);
      const exit = await closed;
      clearTimeout(timer);
      if (failure) throw failure;
      assert.equal(timedOut, false, `round ${round}: CLI did not finish within 60 s: ${stderr}`);
      assert.equal(bodies.length, calls.length + 1, `round ${round}: scripted requests; exit ${exit}; stderr: ${stderr}`);
      rounds.push({exit, stdout, bodies, saved:fs.existsSync(saved) ? fs.readFileSync(saved, 'utf8') : null, root, dir});
    }
    return {name, strip, rounds};
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(tmp, {recursive:true, force:true});
  }
}

// synthetic is an observation that carries exactly what want expects: Go-encoded session.json
// texts, request bodies carrying the delivered outputs and existing usage/attempt events.
function synthetic(name, want, sid, records) {
  const usage = {input:3, cached:0, output:3, reasoning:0, state:'complete', source:'provider'};
  const root = '/tmp/x-' + sid + '/root', dir = '/tmp/x-' + sid + '/session';
  const input = [{role:'user', content:'fixture task'}];
  const rounds = SESSIONS[name].map((calls, r) => {
    const lines = [{type:'session.started', session_id:sid, resumed:r > 0, role:{}, capabilities_digest:'0'.repeat(64)}];
    const tools = want.tools[r], bodies = [];
    if (r > 0) input.push({type:'function_call_output', call_id:'end-' + r, output:'fixture feedback ' + (r + 1)});
    const ids = Object.keys(tools.callEvents);
    ids.forEach((id, k) => {
      bodies.push(JSON.stringify({model:'fixture-model', instructions:'I', input, prompt_cache_key:sid}));
      lines.push({type:'request.started', n:k + 1, owner:'loop', model:'fixture-model', effort:'medium'},
        {type:'request.attempt', n:k + 1, record:{outcome:'completed'}}, {type:'response', n:k + 1, response_id:'resp-' + (k + 1), usage},
        {type:'tool.call', call_id:id, name:id.startsWith('end-') ? 'finish' : 'read_file', arguments_sha256:'0'.repeat(64), ...tools.callEvents[id]});
      if (tools.results[id]) lines.push({type:'tool.result', call_id:id, name:'read_file', result_sha256:'0'.repeat(64), bytes:1, cut:tools.cut[id], ...tools.results[id]});
      input.push({type:'function_call', call_id:id, name:'read_file', arguments:'{}'});
      if (!id.startsWith('end-')) input.push({type:'function_call_output', call_id:id, output:render(want.outputs[id])});
    });
    lines.push({type:'round.ended', ending:'terminal', terminal_tool:'finish', claim:'{"summary":"done"}', requests:ids.length, usage},
      {type:'session.ended', status:'ended', exit:0});
    const stdout = lines.map((l, i) => JSON.stringify({protocol:'kogen-loop/v1', seq:i + 1, time:'2026-11-04T00:00:00Z', ...l})).join('\n') + '\n';
    const t = {protocol:'kogen-loop/v1', session_id:sid, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''},
      instructions_sha256:'1'.repeat(64), definitions_sha256:'2'.repeat(64), terminal:{call_id:'end-' + (r + 1), name:'finish'}, input};
    if (records[r].length) t.cut_reads = records[r];
    return {exit:0, stdout, bodies, saved:JSON.stringify(t) + '\n', root, dir};
  });
  return {name, strip:want.strip, rounds};
}
const good = (name, want) => synthetic(name, want, 'session-0123456789abcdef', want.records);
const pair = (name, want) => synthetic(name, want, 'session-fedcba9876543210', want.records.map(() => []));
const map = (obs, fn) => ({...obs, rounds:obs.rounds.map((r, i) => fn({...r}, i) || r)});
const editEvents = (obs, fn) => map(obs, (r, i) => ({...r, stdout:events(r.stdout).flatMap(e => fn(e, i) || [e]).map(e => JSON.stringify(e)).join('\n') + '\n'}));
const onResult = (id, fn) => e => (e.type === 'tool.result' && e.call_id === id ? [fn(e)] : null);
const editSaved = (obs, round, fn) => map(obs, (r, i) => (i === round ? {...r, saved:JSON.stringify(fn(JSON.parse(r.saved))) + '\n'} : null));
// mutations are wrong observations, each of which the observer must reject.
function mutations(name, want) {
  const g = good(name, want), out = [];
  want.tools.forEach(tools => {
    for (const [id, has] of Object.entries(tools.results)) {
      for (const key of Object.keys(has)) out.push(['drop ' + key + ' of ' + id, editEvents(g, onResult(id, e => { const c = {...e}; delete c[key]; return c; }))]);
      if (has.recovers) {
        out.push(['change recovered lines of ' + id, editEvents(g, onResult(id, e => ({...e, recovers:e.recovers.map(x => ({...x, lines:x.lines + 1}))})))]);
        out.push(['tie ' + id + ' to itself', editEvents(g, onResult(id, e => ({...e, recovers:e.recovers.map(x => ({...x, call_id:id}))})))]);
        out.push(['drop the last recovery of ' + id, editEvents(g, onResult(id, e => (e.recovers.length > 1 ? {...e, recovers:e.recovers.slice(0, -1)} : {...e, recovers:[]})))]);
        if (has.recovers.length > 1) out.push(['reorder the recoveries of ' + id, editEvents(g, onResult(id, e => ({...e, recovers:[...e.recovers].reverse()})))]);
        out.push(['add a path to the recovery of ' + id, editEvents(g, onResult(id, e => ({...e, recovers:e.recovers.map(x => ({...x, file:'f'}))})))]);
      } else if (!has.omitted_lines) {
        out.push(['report ' + id + ' as a recovery', editEvents(g, onResult(id, e => ({...e, recovers:[{call_id:'c-cut', lines:1}]})))]);
      } else {
        out.push(['shift omitted_lines of ' + id, editEvents(g, onResult(id, e => ({...e, omitted_lines:[70, 404]})))]);
      }
    }
  });
  out.push(['add a field to tool.call c-cut', editEvents(g, e => (e.type === 'tool.call' && e.call_id === 'c-cut' ? [{...e, file:'f'}] : null))]);
  out.push(['log file contents', editEvents(g, (e, i) => (e.type === 'session.started' && i === 1 ? [{...e, note:'secret-big-400'}] : null))]);
  out.push(['log a file path', editEvents(g, (e, i) => (e.type === 'round.ended' && i === 1 ? [{...e, claim:'{"summary":"big.txt"}'}] : null))]);
  out.push(['log raw arguments', editEvents(g, (e, i) => (e.type === 'request.attempt' && i === 1 ? [{...e, record:{outcome:'completed', note:JSON.stringify(SESSIONS[name][1][0][1])}}] : null))]);
  out.push(['start round 2 as a new session', editEvents(g, (e, i) => (e.type === 'session.started' && i === 1 ? [{...e, resumed:false}] : null))]);
  out.push(['continue another session in round 2', editEvents(g, (e, i) => (e.type === 'session.started' && i === 1 ? [{...e, session_id:'session-other'}] : null))]);
  out.push(['end round 2 without a terminal call', editEvents(g, (e, i) => (e.type === 'round.ended' && i === 1 ? [{...e, ending:'no_call', terminal_tool:null}] : null))]);
  out.push(['emit an error event', editEvents(g, (e, i) => (e.type === 'session.ended' && i === 1 ? [{type:'error', class:'loop', reason:'failed', detail:'x'}, e] : null))]);
  out.push(['exit 1 in round 2', map(g, (r, i) => (i === 1 ? {...r, exit:1} : null))]);
  out.push(['change a delivered output', map(g, (r, i) => (i === 1 ? {...r, bodies:r.bodies.map(b => b.replace('secret-big-404', 'secret-big-4O4'))} : null))]);
  want.records.forEach((records, i) => {
    if (records.length) {
      out.push([`drop the records of round ${i + 1}`, editSaved(g, i, t => { delete t.cut_reads; return t; })]);
      out.push([`drop a record of round ${i + 1}`, editSaved(g, i, t => ({...t, cut_reads:t.cut_reads.slice(1)}))]);
      out.push([`save an absolute path in round ${i + 1}`, editSaved(g, i, t => ({...t, cut_reads:t.cut_reads.map(x => ({...x, file:'/r/' + x.file}))}))]);
      out.push([`save an extra record field in round ${i + 1}`, editSaved(g, i, t => ({...t, cut_reads:t.cut_reads.map(x => ({...x, lines:1}))}))]);
      out.push([`save cut_reads before input in round ${i + 1}`, editSaved(g, i, t => { const {input, ...rest} = t; return {...rest, input}; })]);
    } else {
      out.push([`save an empty cut_reads in round ${i + 1}`, editSaved(g, i, t => ({...t, cut_reads:[]}))]);
      out.push([`save a record in round ${i + 1}`, editSaved(g, i, t => ({...t, cut_reads:[R1]}))]);
    }
    out.push([`add a session.json member in round ${i + 1}`, editSaved(g, i, t => ({...t, version:2}))]);
  });
  return out;
}
// pairMutations are wrong runs without saved records, each of which the comparison must reject.
function pairMutations(name, want) {
  const p = pair(name, want);
  return [
    ['a request body differs in round 2', map(p, (r, i) => (i === 1 ? {...r, bodies:r.bodies.map((b, k) => (k === 0 ? b.replace('"instructions":"I"', '"instructions":"J"') : b))} : null))],
    ['an extra request body in round 2', map(p, (r, i) => (i === 1 ? {...r, bodies:[...r.bodies, r.bodies[0]]} : null))],
    ['the saved conversation differs in round 1', editSaved(p, 0, t => ({...t, input:[...t.input, {role:'user', content:'x'}]}))],
  ];
}

if (require.main === module) {
  if (process.argv[2] === '--control' && process.argv[3] === 'good') {
    for (const [name, want] of Object.entries(EXPECTED)) {
      const g = good(name, want);
      assert.ok(g.rounds[0].stdout.includes('"output":3'), 'the good stream carries the existing usage.output token count');
      verify(g, want, want.strip ? null : pair(name, want));
    }
    console.log('resumed cut recovery observer accepted');
  } else if (process.argv[2] === '--control' && process.argv[3] === 'bad') {
    for (const [name, want] of Object.entries(EXPECTED)) {
      const other = want.strip ? null : pair(name, want);
      for (const [label, obs] of mutations(name, want)) {
        assert.throws(() => verify(obs, want, other), undefined, name + ' must reject: ' + label);
      }
      if (other) for (const [label, p] of pairMutations(name, want)) {
        assert.throws(() => verify(good(name, want), want, p), undefined, name + ' must reject: ' + label);
      }
    }
    console.log('resumed cut recovery observer rejected'); process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  const P = 'l-cut-recovery-survives-resume: ';
  When(P + 'I run the scripted session {string}, each round in a new process', {timeout:240000}, async function (name) { this.resumeRun = await run(name, false); });
  When(P + 'I run the scripted session {string}, each round in a new process, removing the saved records before each resume', {timeout:240000}, async function (name) { this.resumeRun = await run(name, true); });
  Then(P + 'every round ends with its finish call and exit code 0, every round after the first resumed', function () { checkEnd(this.resumeRun); });
  Then(P + 'the outputs delivered to the model are:', function (text) { checkOutputs(this.resumeRun, JSON.parse(text)); });
  Then(P + 'the event streams carry no file contents, file paths or raw call arguments', function () { checkLeaks(this.resumeRun); });
  Then(P + 'the request bodies and saved conversation equal those of the same rounds with the saved records removed before each resume', {timeout:240000}, async function () {
    checkSameAsWithout(this.resumeRun, await run(this.resumeRun.name, true));
  });
  Then(P + 'session.json after each round saves the records:', function (text) { checkRecords(this.resumeRun, JSON.parse(text)); });
  Then(P + 'the tool events of each round add exactly:', function (text) { checkTools(this.resumeRun, JSON.parse(text)); });
}
