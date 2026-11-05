'use strict';
// Acceptance driver of fix-l-cut-recovery-observability: it builds the real CLI, runs it
// against a local scripted Responses provider that answers one read_file call (with the raw
// arguments text the feature gives) and then finish, and observes the read's tool.result event
// on stdout and the function_call_output text the next request carries to the model. The
// fixture bad.txt is 600 lines, each holding the invalid UTF-8 bytes FF FE, so a valid file of
// the same size would be a cut numbered read.
// `node features/steps/fix-l-cut-recovery-observability__session.js --control good|bad` checks
// the observer on synthetic event streams built from EXPECTED.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

// fixture is bad.txt: line i is "row <i> " FF FE " " and 30 "x", each ending in "\n" (25092 bytes).
const fixture = () => Buffer.concat(Array.from({length:600}, (_, i) =>
  Buffer.concat([Buffer.from(`row ${i + 1} `), Buffer.from([0xff, 0xfe]), Buffer.from(` ${'x'.repeat(30)}\n`)])));
const NOTICE = 'bad.txt: binary file, 25092 bytes (contains a NUL byte or is not valid UTF-8); content not shown';
// EXPECTED repeats the feature's expectations for the observer controls (--control good|bad).
const EXPECTED = {
  whole:{output:NOTICE, result:{cut:false, extras:{}}},
  range:{output:NOTICE, result:{cut:false, extras:{}}},
  surrogate:{output:'error: argument path must be a string', result:{cut:false, extras:{malformed_class:'missing_argument'}}},
};
const envelope = ['protocol', 'seq', 'time', 'type'];
const extras = (e, base) => Object.fromEntries(Object.entries(e).filter(([k]) => ![...envelope, ...base].includes(k)));
// summarize turns the CLI's stdout, the read output the model received and the exit code into
// an observation of the session end and the read call's tool.result event.
function summarize(stdout, output, exit) {
  const events = stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
  const reads = events.filter(e => e.type === 'tool.result' && e.call_id === 'c-read');
  const ended = events.find(e => e.type === 'round.ended');
  return {
    exit, ending:ended ? ended.ending : null, terminal:ended ? ended.terminal_tool : null,
    errors:events.filter(e => e.type === 'error').map(e => ({class:e.class, reason:e.reason, detail:e.detail})),
    results:reads.length, output,
    result:reads.length ? {cut:reads[0].cut, extras:extras(reads[0], ['call_id', 'name', 'result_sha256', 'bytes', 'cut', 'elapsed_ms'])} : null,
  };
}
function checkEnd(obs) {
  assert.deepEqual({exit:obs.exit, ending:obs.ending, terminal:obs.terminal, errors:obs.errors, results:obs.results},
    {exit:0, ending:'terminal', terminal:'finish', errors:[], results:1}, 'session end and one tool.result event for c-read');
}
function checkOutput(obs, want) {
  assert.ok(obs.output === want, 'read output delivered to the model: got ' + JSON.stringify(obs.output) + ', want ' + JSON.stringify(want));
}
function checkResult(obs, cut, want) {
  assert.deepEqual(obs.result, {cut, extras:want}, 'tool.result of c-read (cut, and fields beyond call_id, name, result_sha256, bytes, cut, elapsed_ms)');
}
const verify = (obs, want) => { checkEnd(obs); checkOutput(obs, want.output); checkResult(obs, want.result.cut, want.result.extras); };

let built;
function binary() {
  if (!built) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-l-cut-recovery-observability-bin-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true, force:true}));
    const bin = path.join(dir, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', bin, './cmd/kogen-loop'], {encoding:'utf8', timeout:150000});
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr + (build.error || ''));
    built = bin;
  }
  return built;
}
const USAGE = {input_tokens:3, input_tokens_details:{cached_tokens:0}, output_tokens:3, output_tokens_details:{reasoning_tokens:0}};
// run runs the built CLI once against the scripted provider: request 1 answers read_file call
// c-read with the arguments text args verbatim, request 2 answers finish.
async function run(args) {
  const bin = binary();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'fix-l-cut-recovery-observability-')));
  let server, child, timer, failure, output;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'bad.txt'), fixture());
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive:true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now() / 1000) + 3600}));
    const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''}, instructions:'', prompt:'fixture task', tools:['read_file'], protected:[], excluded:[], terminal:['finish'], deadline_seconds:0, session:{dir:'', resume:false}, requires:[]};
    let requests = 0;
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/v1/responses');
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const n = ++requests;
        assert.ok(n <= 2, 'scripted session request count ' + n);
        for (const x of body.input || []) if (x.type === 'function_call_output' && x.call_id === 'c-read') output = x.output;
        const item = n === 1
          ? {type:'function_call', call_id:'c-read', name:'read_file', arguments:args}
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
    assert.equal(requests, 2, 'scripted session requests; stderr: ' + stderr + '; stdout: ' + stdout.slice(-2000));
    return summarize(stdout, output, exit);
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, {recursive:true, force:true});
  }
}

// stream is a synthetic CLI stdout that carries exactly what want expects.
function stream(want) {
  const usage = {input:3, cached:0, output:3, reasoning:0, state:'complete', source:'provider'};
  const lines = [{type:'session.started', session_id:'s', resumed:false, role:{}, capabilities_digest:'0'.repeat(64)},
    {type:'tool.call', call_id:'c-read', name:'read_file', arguments_sha256:'0'.repeat(64)},
    {type:'tool.result', call_id:'c-read', name:'read_file', result_sha256:'0'.repeat(64), bytes:1, cut:want.result.cut, elapsed_ms:0, ...want.result.extras},
    {type:'tool.call', call_id:'end', name:'finish', arguments_sha256:'0'.repeat(64)},
    {type:'round.ended', ending:'terminal', terminal_tool:'finish', claim:'{"summary":"done"}', requests:2, usage},
    {type:'session.ended', status:'ended', exit:0}];
  return lines.map((l, i) => JSON.stringify({protocol:'kogen-loop/v1', seq:i + 1, time:'2026-11-05T00:00:00Z', ...l})).join('\n') + '\n';
}
const edit = (stdout, fn) => stdout.trim().split('\n').map(s => JSON.parse(s)).flatMap(e => fn(e) || [e]).map(e => JSON.stringify(e)).join('\n') + '\n';
const onRead = fn => e => (e.type === 'tool.result' && e.call_id === 'c-read' ? [fn(e)] : null);
// mutations are wrong CLI streams, each of which the observer must reject.
function mutations(want) {
  const good = stream(want);
  return [
    ['report omitted_lines', edit(good, onRead(e => ({...e, omitted_lines:[1, 600]})))],
    ['report a recovery', edit(good, onRead(e => ({...e, recovers:[{call_id:'c-read', lines:1}]})))],
    ['mark the read cut', edit(good, onRead(e => ({...e, cut:true})))],
    ['drop the read result', edit(good, e => (e.type === 'tool.result' ? [] : null))],
    ['repeat the read result', edit(good, e => (e.type === 'tool.result' ? [e, e] : null))],
    ['end without a terminal call', edit(good, e => (e.type === 'round.ended' ? [{...e, ending:'no_call', terminal_tool:null}] : null))],
    ['emit an error event', good + JSON.stringify({protocol:'kogen-loop/v1', seq:99, time:'2026-11-05T00:00:00Z', type:'error', class:'loop', reason:'failed', detail:'x'}) + '\n'],
  ];
}

if (require.main === module) {
  if (process.argv[2] === '--control' && process.argv[3] === 'good') {
    for (const want of Object.values(EXPECTED)) verify(summarize(stream(want), want.output, 0), want);
    console.log('invalid-byte read observer accepted');
  } else if (process.argv[2] === '--control' && process.argv[3] === 'bad') {
    for (const [name, want] of Object.entries(EXPECTED)) {
      for (const [label, stdout] of mutations(want)) {
        assert.throws(() => verify(summarize(stdout, want.output, 0), want), undefined, name + ' must reject: ' + label);
      }
      assert.throws(() => verify(summarize(stream(want), want.output + 'x', 0), want), undefined, name + ' must reject a changed output');
      assert.throws(() => verify(summarize(stream(want), undefined, 0), want), undefined, name + ' must reject a missing output');
      assert.throws(() => verify(summarize(stream(want), '1\trow 1 �� ' + 'x'.repeat(30), 0), want), undefined, name + ' must reject numbered replaced text');
      assert.throws(() => verify(summarize(stream(want), want.output, 1), want), undefined, name + ' must reject exit 1');
    }
    console.log('invalid-byte read observer rejected'); process.exitCode = 1;
  } else if (process.argv[2] === '--observe') {
    run(process.argv[3]).then(o => console.log(JSON.stringify(o)));
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  const P = 'fix-l-cut-recovery-observability: ';
  When(P + 'the scripted session reads the invalid UTF-8 fixture with the arguments:', {timeout:240000}, async function (args) { this.invalidRead = await run(args); });
  Then(P + 'the session ends with the finish call and exit code 0', function () { checkEnd(this.invalidRead); });
  Then(P + 'the read output delivered to the model is:', function (text) { checkOutput(this.invalidRead, text); });
  Then(P + 'the read\'s tool.result event has cut {word} and adds exactly:', function (cut, text) {
    assert.ok(cut === 'true' || cut === 'false', 'cut must be true or false: ' + cut);
    checkResult(this.invalidRead, cut === 'true', JSON.parse(text));
  });
}
