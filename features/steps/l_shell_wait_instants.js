'use strict';
// Acceptance steps of L-SHELL-WAIT-INSTANTS. The CLI scenario builds the real CLI and runs it
// against a local scripted Responses provider whose first answer is one batch of shell and
// read calls and whose second answer is finish; it observes the tool.call and tool.result
// events on stdout and the function_call_output texts the second request carries to the model.
// The driver scenario runs features/steps/l_shell_wait_instants_driver.go, which calls the
// shell through tools.Tools on controlled time (ShellAfter) and reports each call's ShellWait.
// `node l_shell_wait_instants.js --control good|bad` checks both observers on synthetic input.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

const INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{9}Z$/;
const SECOND = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
// nsOf is an RFC 3339 UTC instant with nine fractional digits as BigInt Unix nanoseconds.
const nsOf = s => BigInt(Date.parse(s.slice(0, 19) + 'Z')) * 1000000n + BigInt(s.slice(20, 29));
// secondOf is the whole second (in nanoseconds) of an event time such as 2026-11-03T08:50:49Z.
const secondOf = s => BigInt(Date.parse(s)) * 1000000n;
const MS = 1000000n;
// The exit command sleeps this long after its process started, so its wait ends at least that
// long after both its spawn and its wait start.
const EXIT_SLEEP = 300n * MS;

// ---- CLI ----

const CALLS = [
  ['exit', 'shell', {command:'sleep 0.3; echo out; exit 3'}],
  ['refused', 'shell', {command:'pkill -f nothing-at-all-l-shell-wait-instants'}],
  ['unknown', 'shell', {handle:'no-such-handle-l-shell-wait-instants'}],
  ['malformed', 'shell', {}],
  ['read', 'read_file', {path:'a.txt'}],
];
const envelope = ['protocol', 'seq', 'time', 'type'];
const extras = (e, base) => Object.fromEntries(Object.entries(e).filter(([k]) => ![...envelope, ...base].includes(k)));
// shape replaces every shell_wait value in the expected format by the word "instant", so the
// comparison shows any value in another format as it is.
const shape = w => (w && typeof w === 'object' && !Array.isArray(w)) ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, typeof v === 'string' && INSTANT.test(v) && k !== 'ended_by' ? 'instant' : v])) : w;
// cliViolations are the ordering rules each shell_wait of the CLI run breaks: every instant
// lies within the run, the wait starts no earlier than its tool.call's second and ends no
// later than its tool.result's second, the wait ends after it starts and after the spawn, and
// the exit command's wait ends at least EXIT_SLEEP after its spawn and its wait start.
function cliViolations(events, started, ended) {
  const out = [];
  const calls = Object.fromEntries(events.filter(e => e.type === 'tool.call').map(e => [e.call_id, e]));
  for (const e of events.filter(e => e.type === 'tool.result' && e.shell_wait && typeof e.shell_wait === 'object')) {
    const w = e.shell_wait, id = e.call_id, t = {};
    for (const k of ['spawned', 'wait_started', 'wait_ended']) if (typeof w[k] === 'string' && INSTANT.test(w[k])) t[k] = nsOf(w[k]);
    if (t.wait_started === undefined || t.wait_ended === undefined) continue;
    for (const [k, v] of Object.entries(t)) if (v < started || v > ended) out.push(id + ': ' + k + ' ' + w[k] + ' is outside the CLI run');
    if (t.wait_ended < t.wait_started) out.push(id + ': wait_ended before wait_started');
    if (t.spawned !== undefined && t.spawned > t.wait_ended) out.push(id + ': spawned after wait_ended');
    const c = calls[id];
    if (!c || !SECOND.test(c.time) || secondOf(c.time) > t.wait_started) out.push(id + ': wait_started before the second of its tool.call event');
    if (!SECOND.test(e.time) || t.wait_ended >= secondOf(e.time) + 1000n * MS) out.push(id + ': wait_ended after the second of its tool.result event');
    if (id === 'exit') {
      if (t.spawned === undefined || t.wait_ended - t.spawned < EXIT_SLEEP) out.push('exit: wait_ended less than 300 ms after spawned');
      if (t.wait_ended - t.wait_started < EXIT_SLEEP) out.push('exit: wait shorter than 300 ms');
    }
  }
  return out;
}
// summarizeCli turns the CLI's stdout, the outputs the model received, the exit code and the
// run's interval (BigInt Unix nanoseconds) into an observation.
function summarizeCli(stdout, outputs, exit, started, ended) {
  const events = stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
  const error = events.find(e => e.type === 'error');
  assert.equal(error, undefined, 'CLI error event ' + JSON.stringify(error));
  const results = {}, callEvents = {};
  for (const e of events) {
    if (e.type === 'tool.result') {
      const x = extras(e, ['call_id', 'name', 'result_sha256', 'bytes', 'cut']);
      if ('shell_wait' in x) x.shell_wait = shape(x.shell_wait);
      results[e.call_id] = x;
    }
    if (e.type === 'tool.call') callEvents[e.call_id] = extras(e, ['call_id', 'name', 'arguments_sha256']);
  }
  const ended_ = events.find(e => e.type === 'round.ended');
  return {exit, ending:ended_ && ended_.ending, callEvents, results, outputs, violations:cliViolations(events, started, ended)};
}
let built;
function binary() {
  if (!built) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-shell-wait-instants-bin-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true, force:true}));
    const bin = path.join(dir, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', bin, './cmd/kogen-loop'], {encoding:'utf8', timeout:100000});
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr + (build.error || ''));
    built = bin;
  }
  return built;
}
const gitEnv = (home, dir) => ({...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))), HOME:home, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null', GIT_CEILING_DIRECTORIES:dir,
  GIT_AUTHOR_NAME:'fixture', GIT_AUTHOR_EMAIL:'fixture@example.invalid', GIT_COMMITTER_NAME:'fixture', GIT_COMMITTER_EMAIL:'fixture@example.invalid'});
// runCli runs the built CLI once on a Git root holding a.txt against the scripted provider.
async function runCli() {
  const bin = binary();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'l-shell-wait-instants-')));
  let server, child, timer, failure;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive:true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now() / 1000) + 3600}));
    const env = gitEnv(home, dir);
    fs.writeFileSync(path.join(root, 'a.txt'), 'alpha\n');
    for (const args of [['init', '-q', '.'], ['add', '-A'], ['commit', '-qm', 'fixture']]) {
      const r = spawnSync('git', args, {cwd:root, env, encoding:'utf8'});
      assert.equal(r.status, 0, 'git ' + args.join(' ') + ': ' + r.stdout + r.stderr);
    }
    const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''}, instructions:'', prompt:'fixture task', tools:['read_file', 'shell'], protected:[], excluded:[], terminal:['finish'], deadline_seconds:0, session:{dir:'', resume:false}, requires:[]};
    const outputs = {};
    let requests = 0;
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/v1/responses');
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const n = ++requests;
        assert.ok(n <= 2, 'shell wait instants fixture request count');
        let items;
        if (n === 1) {
          items = CALLS.map(([id, name, args]) => ({type:'function_call', call_id:id, name, arguments:JSON.stringify(args)}));
        } else {
          for (const x of body.input || []) if (x.type === 'function_call_output') outputs[x.call_id] = x.output;
          items = [{type:'function_call', call_id:'end', name:'finish', arguments:JSON.stringify({summary:'done'})}];
        }
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        for (let i = 0; i < items.length; i++) res.write('data: ' + JSON.stringify({type:'response.output_item.done', output_index:i, item:items[i]}) + '\n\n');
        res.end('data: ' + JSON.stringify({type:'response.completed', response:{status:'completed'}}) + '\n\n');
      } catch (e) { failure = failure || e; res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:e.message}})); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let stdout = '', stderr = '';
    const started = BigInt(Date.now()) * MS;
    child = spawn(bin, ['run', '--task', '-'], {cwd:root, env:{...env, KOGEN_PROVIDER_URL:'http://127.0.0.1:' + server.address().port}});
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
    child.stdin.end(JSON.stringify(task));
    let timedOut = false;
    timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 60000);
    const exit = await closed;
    const ended = (BigInt(Date.now()) + 1n) * MS;
    if (failure) throw failure;
    assert.equal(timedOut, false, 'CLI did not finish within 60 s: ' + stderr);
    return summarizeCli(stdout, outputs, exit, started, ended);
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, {recursive:true, force:true});
  }
}

// ---- driver ----

// status is the outcome a driver call's text shows: the envelope's status, the first line of
// an exit text, "refused" or the error text.
function status(text) {
  if (text.startsWith('{')) { try { return JSON.parse(text).status; } catch (_) { return text; } }
  if (text.startsWith('exit status: ')) return text.split('\n')[0];
  if (text.startsWith('refused: ')) return 'refused';
  return text;
}
// summarizeDriver turns the driver's samples into one row per call (the feature's columns)
// and the ordering rules the samples break: every wait starts within its call and no later
// than the instant the driver fired it, ends no earlier than that instant (or the release)
// and within its call, and a spawn lies within its starting call and before the wait ends.
function summarizeDriver(samples) {
  const rows = [], violations = [];
  const yieldSpawn = (samples.find(s => s.case === 'yield') || {wait:null}).wait;
  for (const s of samples) {
    const w = s.wait;
    let spawned = 'no record';
    if (w) spawned = w.spawned === '' ? 'none' : (yieldSpawn && s.case !== 'yield' && w.spawned === yieldSpawn.spawned ? 'same as yield' : 'set');
    rows.push({case:s.case, asked:s.asked.length ? s.asked.join(' ') : 'none', fired:s.fired_at ? 'yes' : 'no', status:s.error ? 'error ' + s.error : status(s.text), ended_by:w ? w.ended_by : 'no record', spawned});
    if (!w) continue;
    const n = k => s[k] ? BigInt(s[k]) : undefined;
    const before = n('before'), after = n('after'), fired = n('fired_at'), released = n('released');
    const started = BigInt(w.wait_started || 0), ended = BigInt(w.wait_ended || 0);
    if (started < before || started > (fired !== undefined ? fired : after)) violations.push(s.case + ': wait_started outside [call start, the fire or the call end]');
    if (ended > after || ended < (fired !== undefined ? fired : (released !== undefined ? released : started))) violations.push(s.case + ': wait_ended outside [the fire, release or wait start, call end]');
    if (w.spawned !== '') {
      const spawn = BigInt(w.spawned);
      const first = s.case === 'yield' || s.case === 'exit';
      if (spawn > ended || (first && spawn < before)) violations.push(s.case + ': spawned outside its starting call or after wait_ended');
      if (s.case === 'exit' && (ended - spawn < EXIT_SLEEP || ended - started < EXIT_SLEEP)) violations.push('exit: wait_ended less than 300 ms after spawned or wait_started');
    }
  }
  return {rows, violations};
}
function runDriver() {
  const r = spawnSync('go', ['run', 'features/steps/l_shell_wait_instants_driver.go'], {encoding:'utf8', timeout:100000, maxBuffer:16 << 20});
  assert.equal(r.status, 0, 'go run features/steps/l_shell_wait_instants_driver.go exited ' + r.status + (r.error ? ' (' + r.error + ')' : '') + ':\n' + r.stdout + r.stderr);
  return summarizeDriver(JSON.parse(r.stdout));
}

// ---- controls ----

// CLI_WANT and DRIVER_ROWS repeat the feature's expectations for the observer controls.
const REFUSAL = 'refused: this command would stop processes this run did not start (rule: no pkill or killall; kill only pids this run created). Stop what you started with its own pid, for example kill $!, or its process group.';
const WAIT = (spawned, by) => ({spawned, wait_started:'instant', wait_ended:'instant', ended_by:by});
const CLI_WANT = {exit:0, ending:'terminal', violations:[],
  callEvents:{exit:{}, refused:{}, unknown:{}, malformed:{}, read:{}, end:{}},
  results:{exit:{shell_wait:WAIT('instant', 'exit')}, refused:{rule:'pkill-killall', error_kind:'foreign_kill', shell_wait:WAIT(null, 'exit')},
    unknown:{error_kind:'unknown_shell_handle'}, malformed:{malformed_class:'missing_argument'}, read:{}},
  outputs:{exit:'exit status: 3\nout\n', refused:REFUSAL, unknown:'error: unknown shell handle', malformed:'error: supply exactly one of command or handle', read:'1\talpha'}};
const DRIVER_ROWS = [
  {case:'yield', asked:'45s', fired:'yes', status:'running', ended_by:'handle_yielded', spawned:'set'},
  {case:'bound', asked:'30s', fired:'yes', status:'running', ended_by:'bound', spawned:'same as yield'},
  {case:'release', asked:'30s', fired:'no', status:'completed', ended_by:'exit', spawned:'same as yield'},
  {case:'completed', asked:'30s', fired:'no', status:'completed', ended_by:'exit', spawned:'same as yield'},
  {case:'exit', asked:'45s', fired:'no', status:'exit status: 3', ended_by:'exit', spawned:'set'},
  {case:'refused', asked:'45s', fired:'no', status:'refused', ended_by:'exit', spawned:'none'},
  {case:'unknown', asked:'none', fired:'no', status:'error: unknown shell handle', ended_by:'no record', spawned:'no record'},
  {case:'malformed', asked:'none', fired:'no', status:'error: supply exactly one of command or handle', ended_by:'no record', spawned:'no record'},
];
const T0 = 1793685331000000000n;
const iso = ns => new Date(Number(ns / MS)).toISOString().slice(0, 19) + '.' + String(ns % 1000000000n).padStart(9, '0') + 'Z';
const sec = ns => new Date(Number(ns / MS)).toISOString().slice(0, 19) + 'Z';
// cliStream is a synthetic CLI stdout matching CLI_WANT, with the exit wait from 0.1 s to 0.5 s
// after T0 (spawned at 0.11 s) and the refused wait at 0.6 s.
function cliStream() {
  const at = ms => T0 + BigInt(ms) * MS;
  const waits = {exit:{spawned:iso(at(110)), wait_started:iso(at(100)), wait_ended:iso(at(500)), ended_by:'exit'},
    refused:{spawned:null, wait_started:iso(at(600)), wait_ended:iso(at(601)), ended_by:'exit'}};
  const lines = [{type:'session.started', session_id:'s'}];
  for (const id of Object.keys(CLI_WANT.callEvents)) lines.push({type:'tool.call', call_id:id, name:'x', arguments_sha256:'0'.repeat(64), time:sec(T0)});
  for (const id of Object.keys(CLI_WANT.results)) {
    const r = {...CLI_WANT.results[id]};
    if (r.shell_wait) r.shell_wait = waits[id];
    lines.push({type:'tool.result', call_id:id, name:'x', result_sha256:'0'.repeat(64), bytes:1, cut:false, time:sec(at(700)), ...r});
  }
  lines.push({type:'round.ended', ending:'terminal', claim:'{"summary":"done"}'}, {type:'session.ended', status:'ended', exit:0});
  return lines.map((l, i) => JSON.stringify({protocol:'kogen-loop/v1', seq:i + 1, time:sec(T0), ...l})).join('\n') + '\n';
}
const editCli = (stdout, fn) => stdout.trim().split('\n').map(s => JSON.parse(s)).map(e => fn(e) || e).map(e => JSON.stringify(e)).join('\n') + '\n';
const onWait = (id, fn) => e => e.type === 'tool.result' && e.call_id === id ? {...e, shell_wait:fn({...e.shell_wait})} : null;
function cliMutations(good) {
  return [
    ['drop shell_wait of exit', editCli(good, e => e.type === 'tool.result' && e.call_id === 'exit' ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'shell_wait')) : null)],
    ['shell_wait on read', editCli(good, e => e.type === 'tool.result' && e.call_id === 'read' ? {...e, shell_wait:{}} : null)],
    ['shell_wait on unknown handle', editCli(good, e => e.type === 'tool.result' && e.call_id === 'unknown' ? {...e, shell_wait:{spawned:null}} : null)],
    ['shell_wait on tool.call', editCli(good, e => e.type === 'tool.call' && e.call_id === 'exit' ? {...e, shell_wait:{}} : null)],
    ['millisecond instant', editCli(good, onWait('exit', w => ({...w, wait_ended:w.wait_ended.slice(0, 23) + 'Z'})))],
    ['offset instant', editCli(good, onWait('exit', w => ({...w, wait_started:w.wait_started.replace('Z', '+00:00')})))],
    ['spawned null on exit', editCli(good, onWait('exit', w => ({...w, spawned:null})))],
    ['spawned set on refused', editCli(good, onWait('refused', w => ({...w, spawned:w.wait_started})))],
    ['ended_by bound on exit', editCli(good, onWait('exit', w => ({...w, ended_by:'bound'})))],
    ['extra key', editCli(good, onWait('exit', w => ({...w, duration:1})))],
    ['wait_ended at wait start', editCli(good, onWait('exit', w => ({...w, wait_ended:w.wait_started})))],
    ['spawned at wait end', editCli(good, onWait('exit', w => ({...w, spawned:w.wait_ended})))],
    ['wait before its tool.call', editCli(good, onWait('exit', w => ({...w, wait_started:iso(T0 - 2000n * MS)})))],
    ['wait after its tool.result', editCli(good, onWait('refused', w => ({...w, wait_ended:iso(T0 + 1700n * MS)})))],
    ['dropped rule', editCli(good, e => e.type === 'tool.result' && e.call_id === 'refused' ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== 'rule')) : null)],
    ['end without a terminal call', editCli(good, e => e.type === 'round.ended' ? {...e, ending:'no_call'} : null)],
  ];
}
function driverSamples() {
  const s = (c, o) => ({case:c, before:'', asked:[], asked_at:'', fired_at:'', released:'', after:'', text:'', error:'', wait:null, ...o});
  const t = ms => String(T0 + BigInt(ms) * MS);
  const handle = '"handle":"h"';
  return [
    s('yield', {before:t(0), asked:['45s'], asked_at:t(1), fired_at:t(300), after:t(301), text:'{' + handle + ',"output":"","status":"running"}', wait:{spawned:t(20), wait_started:t(1), wait_ended:t(300), ended_by:'handle_yielded'}}),
    s('bound', {before:t(400), asked:['30s'], asked_at:t(401), fired_at:t(500), after:t(501), text:'{' + handle + ',"output":"","status":"running"}', wait:{spawned:t(20), wait_started:t(401), wait_ended:t(500), ended_by:'bound'}}),
    s('release', {before:t(600), asked:['30s'], asked_at:t(601), released:t(900), after:t(960), text:'{"exit_status":0,' + handle + ',"output":"","status":"completed"}', wait:{spawned:t(20), wait_started:t(601), wait_ended:t(950), ended_by:'exit'}}),
    s('completed', {before:t(1000), asked:['30s'], asked_at:t(1001), after:t(1002), text:'{"exit_status":0,' + handle + ',"output":"","status":"completed"}', wait:{spawned:t(20), wait_started:t(1001), wait_ended:t(1001), ended_by:'exit'}}),
    s('exit', {before:t(1100), asked:['45s'], asked_at:t(1101), after:t(1500), text:'exit status: 3\nout\n', wait:{spawned:t(1110), wait_started:t(1101), wait_ended:t(1450), ended_by:'exit'}}),
    s('refused', {before:t(1600), asked:['45s'], asked_at:t(1601), after:t(1602), text:REFUSAL, wait:{spawned:'', wait_started:t(1601), wait_ended:t(1601), ended_by:'exit'}}),
    s('unknown', {before:t(1700), after:t(1701), text:'error: unknown shell handle'}),
    s('malformed', {before:t(1800), after:t(1801), text:'error: supply exactly one of command or handle'}),
  ];
}
function driverMutations(good) {
  const edit = (c, fn) => good.map(s => s.case === c ? fn(JSON.parse(JSON.stringify(s))) : s);
  return [
    ['yield ended by bound', edit('yield', s => (s.wait.ended_by = 'bound', s))],
    ['bound ended by handle_yielded', edit('bound', s => (s.wait.ended_by = 'handle_yielded', s))],
    ['release ended by bound', edit('release', s => (s.wait.ended_by = 'bound', s))],
    ['no wait on exit', edit('exit', s => (s.wait = null, s))],
    ['a wait on unknown', edit('unknown', s => (s.wait = {spawned:'', wait_started:s.before, wait_ended:s.after, ended_by:'exit'}, s))],
    ['retrieval with its own spawn', edit('bound', s => (s.wait.spawned = s.wait.wait_started, s))],
    ['retrieval without spawn', edit('release', s => (s.wait.spawned = '', s))],
    ['refused with a spawn', edit('refused', s => (s.wait.spawned = s.wait.wait_started, s))],
    ['wait ended before the fire', edit('yield', s => (s.wait.wait_ended = s.asked_at, s))],
    ['wait ended before the release', edit('release', s => (s.wait.wait_ended = String(BigInt(s.released) - 10n * MS), s))],
    ['wait started before the call', edit('bound', s => (s.wait.wait_started = String(BigInt(s.before) - MS), s))],
    ['wait started after the fire', edit('yield', s => (s.wait.wait_started = String(BigInt(s.fired_at) + MS), s))],
    ['exit spawned at its end', edit('exit', s => (s.wait.spawned = s.wait.wait_ended, s))],
    ['wrong asked wait', edit('yield', s => (s.asked = ['1s'], s))],
    ['call error', edit('exit', s => (s.error = 'context canceled', s))],
  ];
}
function observeCli(got, want) { assert.deepEqual(got, want, 'shell wait instants CLI observation ' + JSON.stringify(got)); }
function observeDriver(got, rows) { assert.deepEqual(got, {rows, violations:[]}, 'shell wait instants driver observation ' + JSON.stringify(got)); }

if (require.main === module) {
  const span = [T0 - 1000n * MS, T0 + 2000n * MS];
  const good = cliStream(), samples = driverSamples();
  if (process.argv[2] === '--control' && process.argv[3] === 'good') {
    observeCli(summarizeCli(good, CLI_WANT.outputs, 0, ...span), CLI_WANT);
    observeDriver(summarizeDriver(samples), DRIVER_ROWS);
    console.log('shell wait instants observer accepted');
  } else if (process.argv[2] === '--control' && process.argv[3] === 'bad') {
    for (const [label, stdout] of cliMutations(good)) assert.throws(() => observeCli(summarizeCli(stdout, CLI_WANT.outputs, 0, ...span), CLI_WANT), undefined, 'must reject: ' + label);
    assert.throws(() => observeCli(summarizeCli(good, CLI_WANT.outputs, 0, T0 + 200n * MS, span[1]), CLI_WANT), undefined, 'must reject: instants before the run');
    assert.throws(() => observeCli(summarizeCli(good, {...CLI_WANT.outputs, exit:'exit status: 3\n'}, 0, ...span), CLI_WANT), undefined, 'must reject: a changed output');
    for (const [label, mutated] of driverMutations(samples)) assert.throws(() => observeDriver(summarizeDriver(mutated), DRIVER_ROWS), undefined, 'must reject: ' + label);
    console.log('shell wait instants observer rejected'); process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('I run the shell wait instants CLI fixture', {timeout:110000}, async function() { this.shellWaitCli = await runCli(); });
  Then('the shell wait instants CLI observations are:', function(text) { observeCli(this.shellWaitCli, JSON.parse(text)); });
  When('I run the shell wait instants driver', {timeout:110000}, function() { this.shellWaitDriver = runDriver(); });
  Then('the shell calls of the driver recorded these waits, each within its call and at the instant that ended it:', function(table) { observeDriver(this.shellWaitDriver, table.hashes()); });
}
