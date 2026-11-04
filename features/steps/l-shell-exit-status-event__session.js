'use strict';
// Acceptance driver of l-shell-exit-status-event: it builds the real CLI, runs it against a
// local scripted Responses provider that answers one tool call per request and then finish,
// and observes the tool.call and tool.result events on stdout and the function_call_output
// texts the later requests carry to the model.
// `node features/steps/l-shell-exit-status-event__session.js --control good|bad` checks the
// observer on synthetic event streams built from EXPECTED.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

// The read_file fixture: a.txt holds this one line.
const FILE_TEXT = 'l-ses-file-text';
// The yielding command prints its first line, waits for the file "release" in the root, which
// the scripted provider creates when the yield's running result reaches it, prints its second
// line and exits 4.
const YIELD_COMMAND = 'echo l-ses-yield-waiting; while [ ! -f release ]; do sleep .05; done; echo l-ses-yield-done; exit 4';
// CALLS are the scripted model's calls, one per request: [call_id, tool, arguments]. A
// "<handle>" argument is the handle of the first running result the model received.
const CALLS = {
  completed: [
    ['ok', 'shell', {command:'exit 0'}],
    ['three', 'shell', {command:'exit 3'}],
    ['killed', 'shell', {command:'echo l-ses-before-kill; kill -9 $$'}],
    ['printed', 'shell', {command:"printf 'exit status: 9\\n'"}],
    ['refused', 'shell', {command:'pkill -f nothing-at-all-l-shell-exit-status-event'}],
    ['unknown', 'shell', {handle:'no-such-handle-l-shell-exit-status-event'}],
    ['malformed', 'shell', {}],
    ['read', 'read_file', {path:'a.txt'}],
  ],
  yield: [
    ['start', 'shell', {command:YIELD_COMMAND}],
    ['collect', 'shell', {handle:'<handle>'}],
    ['again', 'shell', {handle:'<handle>'}],
  ],
};
const WAIT = (spawned, endedBy) => ({spawned, wait_started:'instant', wait_ended:'instant', ended_by:endedBy});
const REFUSAL = 'refused: this command would stop processes this run did not start (rule: no pkill or killall; kill only pids this run created). Stop what you started with its own pid, for example kill $!, or its process group.';
// EXPECTED repeats the feature's expectations for the observer controls (--control good|bad).
const EXPECTED = {
  completed: {
    outputs:{ok:'exit status: 0\n', three:'exit status: 3\n', killed:'exit status: 137\nl-ses-before-kill\n',
      printed:'exit status: 0\nexit status: 9\n', refused:REFUSAL, unknown:'error: unknown shell handle',
      malformed:'error: supply exactly one of command or handle', read:'1\t' + FILE_TEXT},
    tools:{callEvents:{ok:{}, three:{}, killed:{}, printed:{}, refused:{}, unknown:{}, malformed:{}, read:{}, end:{}},
      results:{ok:{exit_status:0, shell_wait:WAIT('instant', 'exit')}, three:{exit_status:3, shell_wait:WAIT('instant', 'exit')},
        killed:{exit_status:137, shell_wait:WAIT('instant', 'exit')}, printed:{exit_status:0, shell_wait:WAIT('instant', 'exit')},
        refused:{rule:'pkill-killall', error_kind:'foreign_kill', shell_wait:WAIT(null, 'exit')},
        unknown:{error_kind:'unknown_shell_handle'}, malformed:{malformed_class:'missing_argument'}, read:{}}},
  },
  yield: {
    outputs:{start:'{"handle":"<handle>","output":"l-ses-yield-waiting\\n","status":"running"}',
      collect:'{"exit_status":4,"handle":"<handle>","output":"l-ses-yield-waiting\\nl-ses-yield-done\\n","status":"completed"}',
      again:'{"exit_status":4,"handle":"<handle>","output":"l-ses-yield-waiting\\nl-ses-yield-done\\n","status":"completed"}'},
    tools:{callEvents:{start:{}, collect:{}, again:{}, end:{}},
      results:{start:{shell_wait:WAIT('instant', 'handle_yielded')}, collect:{exit_status:4, shell_wait:WAIT('instant', 'exit')},
        again:{exit_status:4, shell_wait:WAIT('instant', 'exit')}}},
  },
};
// LEAKS are command output and file texts that must not appear anywhere on stdout.
const LEAKS = ['exit status', 'l-ses-before-kill', 'l-ses-yield-waiting', 'l-ses-yield-done', FILE_TEXT];
const INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{9}Z$/;
// shape replaces every shell_wait instant in the expected format by the word "instant".
const shape = w => (w && typeof w === 'object' && !Array.isArray(w))
  ? Object.fromEntries(Object.entries(w).map(([k, v]) => [k, k !== 'ended_by' && typeof v === 'string' && INSTANT.test(v) ? 'instant' : v])) : w;
const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const envelope = ['protocol', 'seq', 'time', 'type'];
// extras are an event's fields beyond the envelope and the given existing fields.
const extras = (e, base) => Object.fromEntries(Object.entries(e).filter(([k]) => ![...envelope, ...base].includes(k)));
// summarize turns the CLI's stdout, the raw outputs the model received, the handle the model
// received (or null) and the exit code into an observation. Outputs show the handle as <handle>.
function summarize(mode, stdout, raw, handle, exit) {
  const events = stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
  const callEvents = {}, results = {}, described = {};
  const names = Object.fromEntries(CALLS[mode].map(([id, name]) => [id, name]));
  for (const e of events) {
    if (e.type === 'tool.call') callEvents[e.call_id] = extras(e, ['call_id', 'name', 'arguments_sha256']);
    if (e.type === 'tool.result') {
      const x = extras(e, ['call_id', 'name', 'result_sha256', 'bytes', 'cut']);
      if ('shell_wait' in x) x.shell_wait = shape(x.shell_wait);
      results[e.call_id] = x;
      const out = raw[e.call_id];
      described[e.call_id] = typeof out === 'string' && e.name === names[e.call_id] && e.cut === false
        && e.result_sha256 === sha256(out) && e.bytes === Buffer.byteLength(out, 'utf8')
        ? 'matches' : 'differs: ' + JSON.stringify({name:e.name, cut:e.cut, result_sha256:e.result_sha256, bytes:e.bytes});
    }
  }
  const ended = events.find(e => e.type === 'round.ended');
  const outputs = Object.fromEntries(Object.entries(raw).map(([id, s]) => [id, handle ? s.split(handle).join('<handle>') : s]));
  return {
    exit, ending:ended ? ended.ending : null, terminal:ended ? ended.terminal_tool : null,
    errors:events.filter(e => e.type === 'error').map(e => ({class:e.class, reason:e.reason, detail:e.detail})),
    logged:LEAKS.filter(t => stdout.includes(t)), tools:{callEvents, results}, described, outputs,
  };
}
function checkEnd(obs) {
  assert.deepEqual({exit:obs.exit, ending:obs.ending, terminal:obs.terminal, errors:obs.errors}, {exit:0, ending:'terminal', terminal:'finish', errors:[]}, 'session end');
}
function checkOutputs(obs, want) {
  assert.deepEqual(obs.outputs, want, 'outputs delivered to the model');
}
function checkDescribed(obs, want) {
  const all = Object.fromEntries(Object.keys(want).map(id => [id, 'matches']));
  assert.deepEqual(obs.described, all, 'tool.result name, cut, result_sha256 and bytes against the delivered outputs');
}
function checkLeaks(obs) {
  assert.deepEqual(obs.logged, [], 'command output and file texts the event stream must not carry');
}
function checkTools(obs, want) {
  assert.deepEqual(obs.tools, want, 'fields tool.call and tool.result events add: ' + JSON.stringify(obs.tools));
}
const verify = (obs, want) => { checkEnd(obs); checkOutputs(obs, want.outputs); checkDescribed(obs, want.outputs); checkLeaks(obs); checkTools(obs, want.tools); };

let built;
function binary() {
  if (!built) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-shell-exit-status-event-bin-'));
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
// of CALLS[mode], the request after the last call answers finish. When the running result of a
// yielded command reaches the provider, it takes its handle and creates "release" in the root.
async function run(mode) {
  assert.ok(CALLS[mode], 'unknown scripted session ' + mode);
  const bin = binary();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'l-shell-exit-status-event-')));
  let server, child, timer, failure;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'a.txt'), FILE_TEXT + '\n');
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive:true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now() / 1000) + 3600}));
    const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''}, instructions:'', prompt:'fixture task', tools:['shell', 'read_file'], protected:[], excluded:[], terminal:['finish'], deadline_seconds:0, session:{dir:'', resume:false}, requires:[]};
    const calls = CALLS[mode], outputs = {};
    let requests = 0, handle = null;
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/v1/responses');
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const n = ++requests;
        assert.ok(n <= calls.length + 1, 'scripted session request count ' + n);
        for (const x of body.input || []) if (x.type === 'function_call_output') outputs[x.call_id] = x.output;
        if (handle === null) {
          for (const out of Object.values(outputs)) {
            let env; try { env = JSON.parse(out); } catch { continue; }
            if (env && env.status === 'running' && typeof env.handle === 'string') {
              handle = env.handle;
              fs.writeFileSync(path.join(root, 'release'), '');
            }
          }
        }
        let item;
        if (n <= calls.length) {
          const [id, name, args] = calls[n - 1];
          const used = args.handle === '<handle>' ? {handle} : args;
          assert.ok(used.handle !== null, 'no running result carried a handle before call ' + id);
          item = {type:'function_call', call_id:id, name, arguments:JSON.stringify(used)};
        } else {
          item = {type:'function_call', call_id:'end', name:'finish', arguments:JSON.stringify({summary:'done'})};
        }
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
    timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 150000);
    const exit = await closed;
    if (failure) throw failure;
    assert.equal(timedOut, false, 'CLI did not finish within 150 s: ' + stderr);
    assert.equal(requests, calls.length + 1, 'scripted session requests; stderr: ' + stderr);
    return summarize(mode, stdout, outputs, handle, exit);
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, {recursive:true, force:true});
  }
}

// ---- observer controls ----

const FAKE_HANDLE = '0123456789abcdef0123456789abcdef';
const T = '2026-11-04T00:00:00.123456789Z';
const realWait = w => (w ? {...w, spawned:w.spawned === 'instant' ? T : w.spawned, wait_started:T, wait_ended:T} : w);
// rawOutputs are EXPECTED's outputs with the fake handle in place of <handle>.
const rawOutputs = want => Object.fromEntries(Object.entries(want.outputs).map(([id, s]) => [id, s.split('<handle>').join(FAKE_HANDLE)]));
// stream is a synthetic CLI stdout that carries exactly what want expects for the given raw
// outputs, with the existing response usage (its "output" token count included).
function stream(mode, want, raw) {
  const usage = {input:3, cached:0, output:3, reasoning:0, state:'complete', source:'provider'};
  const names = Object.fromEntries(CALLS[mode].map(([id, name]) => [id, name]));
  const lines = [{type:'session.started', session_id:'s', resumed:false, role:{}, capabilities_digest:'0'.repeat(64)}];
  const ids = Object.keys(want.tools.callEvents);
  ids.forEach((id, i) => {
    lines.push({type:'request.started', n:i + 1, owner:'loop', model:'fixture-model', effort:'medium'},
      {type:'request.attempt', n:i + 1, record:{outcome:'completed'}}, {type:'response', n:i + 1, response_id:'resp-' + (i + 1), usage},
      {type:'tool.call', call_id:id, name:id === 'end' ? 'finish' : names[id], arguments_sha256:'0'.repeat(64), ...want.tools.callEvents[id]});
    const r = want.tools.results[id];
    if (r) {
      const x = {...r}; if (x.shell_wait) x.shell_wait = realWait(x.shell_wait);
      lines.push({type:'tool.result', call_id:id, name:names[id], result_sha256:sha256(raw[id]), bytes:Buffer.byteLength(raw[id], 'utf8'), cut:false, ...x});
    }
  });
  lines.push({type:'round.ended', ending:'terminal', terminal_tool:'finish', claim:'{"summary":"done"}', requests:ids.length, usage},
    {type:'session.ended', status:'ended', exit:0});
  return lines.map((l, i) => JSON.stringify({protocol:'kogen-loop/v1', seq:i + 1, time:'2026-11-04T00:00:00Z', ...l})).join('\n') + '\n';
}
// edit is stdout with fn applied to its parsed lines.
const edit = (stdout, fn) => stdout.trim().split('\n').map(s => JSON.parse(s)).flatMap(e => fn(e) || [e]).map(e => JSON.stringify(e)).join('\n') + '\n';
const onResult = (id, fn) => e => (e.type === 'tool.result' && e.call_id === id ? [fn(e)] : null);
const without = (e, key) => { const c = {...e}; delete c[key]; return c; };
// mutations are wrong CLI streams, each of which the observer must reject.
function mutations(mode, want, raw) {
  const good = stream(mode, want, raw), out = [];
  for (const [id, has] of Object.entries(want.tools.results)) {
    if ('exit_status' in has) {
      out.push(['drop exit_status of ' + id, edit(good, onResult(id, e => without(e, 'exit_status')))]);
      out.push(['exit_status of ' + id + ' as a string', edit(good, onResult(id, e => ({...e, exit_status:String(e.exit_status)})))]);
      out.push(['exit_status of ' + id + ' off by one', edit(good, onResult(id, e => ({...e, exit_status:e.exit_status + 1})))]);
      out.push(['exit_status of ' + id + ' parsed from the output', edit(good, onResult(id, e => ({...e, exit_status:id === 'printed' ? 9 : e.exit_status - 128})))]);
    } else {
      out.push(['add exit_status 0 to ' + id, edit(good, onResult(id, e => ({...e, exit_status:0})))]);
      out.push(['add exit_status 126 to ' + id, edit(good, onResult(id, e => ({...e, exit_status:126})))]);
    }
    if (has.shell_wait) out.push(['drop shell_wait of ' + id, edit(good, onResult(id, e => without(e, 'shell_wait')))]);
    if (has.rule) out.push(['drop the rule of ' + id, edit(good, onResult(id, e => without(e, 'rule')))]);
    out.push(['add a tool output payload to ' + id, edit(good, onResult(id, e => ({...e, output:'(redacted)'})))]);
    out.push(['change the bytes of ' + id, edit(good, onResult(id, e => ({...e, bytes:e.bytes + 1})))]);
    out.push(['change the digest of ' + id, edit(good, onResult(id, e => ({...e, result_sha256:'1'.repeat(64)})))]);
    out.push(['mark ' + id + ' cut', edit(good, onResult(id, e => ({...e, cut:true})))]);
  }
  out.push(['add a field to a tool.call', edit(good, e => (e.type === 'tool.call' && e.call_id !== 'end' ? [{...e, exit_status:0}] : null))]);
  out.push(['log command output', edit(good, e => (e.type === 'session.started' ? [{...e, note:mode === 'yield' ? 'l-ses-yield-done' : 'exit status: 9'}] : null))]);
  out.push(['log file text', edit(good, e => (e.type === 'round.ended' ? [{...e, claim:'{"summary":"l-ses-file-text"}'}] : null))]);
  out.push(['end without a terminal call', edit(good, e => (e.type === 'round.ended' ? [{...e, ending:'no_call', terminal_tool:null}] : null))]);
  out.push(['emit an error event', good + JSON.stringify({protocol:'kogen-loop/v1', seq:99, time:'2026-11-04T00:00:00Z', type:'error', class:'loop', reason:'failed', detail:'x'}) + '\n']);
  return out;
}

if (require.main === module) {
  if (process.argv[2] === '--control' && process.argv[3] === 'good') {
    for (const [mode, want] of Object.entries(EXPECTED)) {
      const raw = rawOutputs(want), good = stream(mode, want, raw);
      assert.ok(good.includes('"output":3'), 'the good stream carries the existing usage.output token count');
      verify(summarize(mode, good, raw, mode === 'yield' ? FAKE_HANDLE : null, 0), want);
    }
    console.log('shell exit status observer accepted');
  } else if (process.argv[2] === '--control' && process.argv[3] === 'bad') {
    let rejected = 0;
    for (const [mode, want] of Object.entries(EXPECTED)) {
      const raw = rawOutputs(want), handle = mode === 'yield' ? FAKE_HANDLE : null;
      for (const [label, stdout] of mutations(mode, want, raw)) {
        assert.throws(() => verify(summarize(mode, stdout, raw, handle, 0), want), undefined, mode + ' must reject: ' + label);
        rejected++;
      }
      for (const id of Object.keys(raw)) {
        const changed = {...raw, [id]:raw[id] + 'x'};
        assert.throws(() => verify(summarize(mode, stream(mode, want, raw), changed, handle, 0), want), undefined, mode + ' must reject a changed output of ' + id);
        const fewer = {...raw}; delete fewer[id];
        assert.throws(() => verify(summarize(mode, stream(mode, want, raw), fewer, handle, 0), want), undefined, mode + ' must reject a missing output of ' + id);
        rejected += 2;
      }
      assert.throws(() => verify(summarize(mode, stream(mode, want, raw), raw, handle, 1), want), undefined, mode + ' must reject exit 1');
      rejected++;
    }
    assert.ok(rejected > 100, 'rejected mutations ' + rejected);
    console.log('shell exit status observer rejected'); process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  const P = 'l-shell-exit-status-event: ';
  When(P + 'I run the scripted session {string}', {timeout:240000}, async function (mode) { this.shellExitStatus = await run(mode); });
  Then(P + 'the session ends with the finish call and exit code 0', function () { checkEnd(this.shellExitStatus); });
  Then(P + 'the outputs delivered to the model are:', function (text) { checkOutputs(this.shellExitStatus, JSON.parse(text)); });
  Then(P + 'each tool.result describes the output the model received', function () { checkDescribed(this.shellExitStatus, this.shellExitStatus.outputs); });
  Then(P + 'the event stream carries no command output or file text', function () { checkLeaks(this.shellExitStatus); });
  Then(P + 'the tool events add exactly:', function (text) { checkTools(this.shellExitStatus, JSON.parse(text)); });
}
