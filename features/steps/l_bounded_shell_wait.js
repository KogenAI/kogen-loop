'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

const WAIT_TEXT = 'A new command waits up to 45 seconds; retrieval waits up to 30 seconds.';
const EXPECTED = {
  fast: {requests:2, firstResult:'exit status: 7\npartial\ncomplete\n', handle:false, description:true, exit:0},
  long: {requests:3, firstStatus:'running', firstOutput:'partial\n', heldUntilBound:true, yieldedByBound:true, aliveAtYield:true, completed:{status:'completed', sameHandle:true, exit_status:7, output:'partial\ncomplete\n'}, cleaned:true, exit:0},
  cancel: {requests:1, aliveBeforeEnd:true, stoppedPromptly:true, cleaned:true, exit:143},
  deadline: {requests:1, aliveBeforeEnd:true, stoppedPromptly:true, cleaned:true, exit:1, reason:'deadline'},
};
function observe(got, want) {
  for (const [key, value] of Object.entries(want)) assert.deepEqual(got[key], value, 'bounded shell wait observation ' + key + ' in ' + JSON.stringify(got));
}
function live(pid) {
  const r = spawnSync('ps', ['-o', 'stat=', '-p', String(pid)], {encoding: 'utf8'});
  if (r.status === 1) return false;
  assert.equal(r.status, 0, 'ps observation failed: ' + r.stderr);
  return r.stdout.trim() !== '' && !r.stdout.trim().startsWith('Z');
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, ms, label) {
  const end = Date.now() + ms;
  while (!fn()) { assert.ok(Date.now() < end, label); await delay(25); }
}
let built;
function binary() {
  if (!built) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-bounded-shell-wait-bin-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true, force:true}));
    const bin = path.join(dir, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', bin, './cmd/kogen-loop'], {encoding:'utf8', timeout:60000});
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr + (build.error || ''));
    built = bin;
  }
  return built;
}
// exercise runs the built CLI against a local scripted Responses provider. The model's first
// answer starts one shell command; later answers depend on the mode:
//   fast      a few-second command whose result must arrive in the first tool response
//   long      a release-gated command that outlasts the 45-second bound and yields a handle
//   cancel    SIGTERM to the CLI two seconds into the wait
//   deadline  a 3-second whole-round deadline during the wait
async function exercise(mode) {
  const bin = binary();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-bounded-shell-wait-'));
  let child, server, timer, pid, failure;
  const seen = {requests:0};
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive:true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now()/1000)+3600}));
    const call = (id, args) => ({type:'function_call', call_id:id, name:'shell', arguments:JSON.stringify(args)});
    const done = {type:'message', role:'assistant', content:[{type:'output_text', text:'done'}]};
    const command = mode === 'fast'
      ? "printf 'partial\\n'; sleep 3; printf 'complete\\n'; exit 7"
      : "echo $$ > actor.pid; printf 'partial\\n'; while [ ! -f release ]; do sleep 0.05; done; printf 'complete\\n'; exit 7";
    let started, handle, first;
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/v1/responses');
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const outputs = (body.input || []).filter(x => x.type === 'function_call_output');
        const n = ++seen.requests;
        assert.ok(n <= 6, 'bounded fixture request count');
        let items;
        if (n === 1) {
          const shell = (body.tools || []).find(t => t.name === 'shell');
          seen.description = !!shell && String(shell.description).includes(WAIT_TEXT);
          items = [call('start', {command})];
        } else if (mode === 'cancel' || mode === 'deadline') {
          return; // A request after the shell call means the wait returned early; leave it unanswered.
        } else {
          const id = n === 2 ? 'start' : 'poll';
          const output = outputs.find(x => x.call_id === id);
          assert.ok(output, 'shell result ' + id + ' reaches model request ' + n);
          if (n === 2) {
            const waited = Date.now() - started;
            console.log('first shell result after ' + waited + ' ms');
            seen.firstResult = output.output;
            try { first = JSON.parse(output.output); } catch (_) { first = undefined; }
            seen.handle = !!(first && typeof first === 'object' && 'handle' in first);
            if (mode === 'fast') items = [done];
            else {
              assert.ok(first && typeof first === 'object', 'long command first result must be a JSON envelope: ' + output.output);
              seen.firstStatus = first.status; seen.firstOutput = first.output;
              seen.heldUntilBound = waited >= 44000; seen.yieldedByBound = waited < 55000;
              assert.equal(typeof first.handle, 'string', 'running envelope handle'); assert.ok(first.handle.length > 0, 'nonempty handle');
              handle = first.handle;
              pid = Number(fs.readFileSync(path.join(root, 'actor.pid'), 'utf8').trim());
              assert.ok(Number.isInteger(pid) && pid > 1, 'actor pid');
              seen.aliveAtYield = live(pid);
              fs.writeFileSync(path.join(root, 'release'), 'go');
              await until(() => !live(pid), 5000, 'released command failed to complete');
              items = [call('poll', {handle})];
            }
          } else {
            const out = JSON.parse(output.output);
            seen.completed = {status:out.status, sameHandle:out.handle === handle, exit_status:out.exit_status, output:out.output};
            items = [done];
          }
        }
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        for (let i = 0; i < items.length; i++) res.write('data: '+JSON.stringify({type:'response.output_item.done', output_index:i, item:items[i]})+'\n\n');
        res.end('data: '+JSON.stringify({type:'response.completed', response:{status:'completed'}})+'\n\n');
        if (n === 1) started = Date.now();
      } catch (e) { failure = failure || e; res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:e.message}})); if (child) child.kill('SIGTERM'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''}, instructions:'', prompt:'fixture task', tools:['shell'], protected:[], excluded:[], terminal:['finish'], deadline_seconds:mode === 'deadline' ? 3 : 0, session:{dir:'', resume:false}, requires:[]};
    let stdout = '', stderr = '';
    child = spawn(bin, ['run', '--task', '-'], {cwd:root, env:{...process.env, HOME:home, KOGEN_PROVIDER_URL:'http://127.0.0.1:'+server.address().port}});
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const closed = new Promise((resolve, reject) => {child.on('error', reject); child.on('close', (code, signal) => resolve({code, signal}));});
    child.stdin.end(JSON.stringify(task));
    let timedOut = false;
    timer = setTimeout(() => {timedOut = true; child.kill('SIGKILL');}, mode === 'long' ? 80000 : 30000);
    let ending;
    if (mode === 'cancel' || mode === 'deadline') {
      const pidPath = path.join(root, 'actor.pid');
      await until(() => fs.existsSync(pidPath) && fs.readFileSync(pidPath, 'utf8').trim() !== '', 10000, 'shell command never started');
      pid = Number(fs.readFileSync(pidPath, 'utf8').trim());
      assert.ok(Number.isInteger(pid) && pid > 1, 'actor pid');
      await delay(mode === 'cancel' ? 2000 : 1000);
      seen.aliveBeforeEnd = live(pid);
      ending = Date.now();
      if (mode === 'cancel') child.kill('SIGTERM');
    }
    const exit = await closed; clearTimeout(timer);
    if (failure) throw failure;
    assert.equal(timedOut, false, 'CLI did not finish within its fixture watchdog: ' + stderr);
    seen.exit = exit.code;
    if (ending) seen.stoppedPromptly = Date.now() - ending < (mode === 'cancel' ? 10000 : 12000);
    const events = stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
    const error = events.find(e => e.type === 'error');
    if (error) seen.reason = error.reason;
    if (pid) { await until(() => !live(pid), 3000, 'owned shell survived the round, cancellation or deadline'); seen.cleaned = true; }
    return seen;
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (pid && live(pid)) { try { process.kill(pid, 'SIGKILL'); } catch (_) {} }
    fs.rmSync(dir, {recursive:true, force:true});
  }
}
if (require.main === module) {
  if (process.argv[2] === '--control') {
    if (process.argv[3] === 'good') {
      for (const want of Object.values(EXPECTED)) observe(structuredClone(want), want);
      console.log('bounded shell wait observer accepted');
    } else {
      for (const want of Object.values(EXPECTED)) {
        for (const [key, value] of Object.entries(want)) {
          const wrong = typeof value === 'boolean' ? !value : typeof value === 'number' ? value + 1 : typeof value === 'string' ? value + 'x' : {...value, status:'running'};
          assert.throws(() => observe({...want, [key]:wrong}, want), undefined, 'must reject ' + key);
          const missing = {...want}; delete missing[key];
          assert.throws(() => observe(missing, want), undefined, 'must reject missing ' + key);
        }
      }
      console.log('bounded shell wait observer rejected'); process.exitCode = 1;
    }
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('I run the bounded shell wait CLI fixture {string}', {timeout:110000}, async function(mode) { this.boundedShellWait = await exercise(mode); });
  Then('the bounded shell wait observations are:', function(text) { observe(this.boundedShellWait, JSON.parse(text)); });
}
