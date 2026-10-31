'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

function observe(got, want) {
  for (const [key, value] of Object.entries(want)) assert.deepEqual(got[key], value, 'shell-hang observation: ' + key);
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
async function exercise(mode) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-shell-hang-'));
  let child, server, timer, pid;
  const seen = {};
  try {
    const bin = path.join(dir, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', bin, './cmd/kogen-loop'], {encoding: 'utf8', timeout: 45000});
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr + (build.error || ''));
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive: true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now()/1000)+3600}));
    let count = 0, failure, started, handle;
    let stdout = '', stderr = '';
    const call = (id, args) => ({type:'function_call', call_id:id, name:'shell', arguments:JSON.stringify(args)});
    const command = mode === 'quick' ? "printf 'out\\n'; printf 'err\\n' >&2; exit 7" : "echo $$ > actor.pid; printf 'partial\\n'; while [ ! -f release ]; do sleep 0.05; done; printf 'complete\\n'; exit 7";
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/v1/responses');
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const outputs = (body.input || []).filter(x => x.type === 'function_call_output');
        let items;
        count++;
        if (count === 1) {
          started = Date.now(); items = [call('start', {command})];
        } else if (mode === 'quick') {
          assert.equal(count, 2);
          observe({text:outputs.find(x => x.call_id === 'start').output}, {text:'exit status: 7\nout\nerr\n'});
          seen.quick = true;
          items = [{type:'message', role:'assistant', content:[{type:'output_text', text:'done'}]}];
        } else {
          const id = count === 2 ? 'start' : count === 3 ? 'poll' : 'join';
          const out = JSON.parse(outputs.find(x => x.call_id === id).output);
          if (count === 2) {
            observe({status:out.status, partial:out.output.includes('partial\n'), bounded:Date.now()-started < 8000}, {status:'running', partial:true, bounded:true});
            assert.equal(typeof out.handle, 'string'); assert.ok(out.handle.length > 0); handle = out.handle;
            pid = Number(fs.readFileSync(path.join(root, 'actor.pid'), 'utf8').trim());
            assert.ok(Number.isInteger(pid) && pid > 1);
            seen.yieldedAlive = live(pid);
            if (mode === 'finish') items = [{type:'message', role:'assistant', content:[{type:'output_text', text:'done'}]}];
            else if (mode === 'cancel') { child.kill('SIGTERM'); res.end(); return; }
            else { started = Date.now(); items = [call('poll', {handle})]; }
          } else if (count === 3) {
            observe({status:out.status, same:out.handle === handle, alive:live(pid), bounded:Date.now()-started < 8000}, {status:'running', same:true, alive:true, bounded:true});
            seen.pollBounded = true;
            fs.writeFileSync(path.join(root, 'release'), 'go');
            // Observe actual command completion before asking for the completed snapshot.
            await until(() => !live(pid), 3000, 'released command failed to complete');
            items = [call('join', {handle})];
          } else {
            assert.equal(count, 4);
            observe(out, {status:'completed', handle, exit_status:7, output:'partial\ncomplete\n'});
            seen.completed = true;
            items = [{type:'message', role:'assistant', content:[{type:'output_text', text:'done'}]}];
          }
        }
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        for (let i=0;i<items.length;i++) res.write('data: '+JSON.stringify({type:'response.output_item.done',output_index:i,item:items[i]})+'\n\n');
        res.end('data: '+JSON.stringify({type:'response.completed',response:{status:'completed'}})+'\n\n');
      } catch (e) { failure = e; res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:e.message}})); child.kill('SIGTERM'); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt',model:'fixture-model',effort:'medium',base_url:''}, instructions:'',prompt:'fixture task',tools:['shell'],protected:[],excluded:[],terminal:['finish'],deadline_seconds:0,session:{dir:'',resume:false},requires:[]};
    child = spawn(bin, ['run','--task','-'], {cwd:root,env:{...process.env,HOME:home,KOGEN_PROVIDER_URL:'http://127.0.0.1:'+server.address().port}});
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const done = new Promise((resolve,reject) => {child.on('error',reject);child.on('close',(code,signal)=>resolve({code,signal}));});
    child.stdin.end(JSON.stringify(task));
    let timedOut = false;
    timer = setTimeout(() => {timedOut = true; child.kill('SIGTERM');}, 12000);
    const exit = await done; clearTimeout(timer);
    if (failure) throw failure;
    assert.equal(timedOut, false, 'CLI failed to yield within explicit 12 second fixture watchdog (unbounded shell wait)');
    const events = stdout.trim().split('\n').map(s => JSON.parse(s));
    assert.ok(events.some(e => e.type === 'tool.call'), 'real CLI must execute a tool call: '+stderr);
    if (mode !== 'cancel') {
      assert.equal(exit.code, 0, 'CLI exit: '+JSON.stringify(exit)+' '+stderr);
      assert.ok(events.some(e => e.type === 'round.ended'), 'CLI round must complete');
    } else assert.notEqual(exit.code, 0, 'cancelled CLI must not succeed');
    if (pid) { await until(() => !live(pid), 3000, 'owned shell survived round/cancellation'); seen.cleaned = true; }
    seen.requests = count;
    return seen;
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    if (pid && live(pid)) { try { process.kill(pid, 'SIGKILL'); } catch (_) {} }
    fs.rmSync(dir, {recursive:true,force:true});
  }
}
if (require.main === module) {
  const good = {yieldedAlive:true,pollBounded:true,completed:true,cleaned:true,requests:4,quick:true};
  if (process.argv[2] === '--control') {
    if (process.argv[3] === 'good') { observe(good, good); console.log('shell-hang observer accepted'); }
    else {
      for (const key of Object.keys(good)) {
        const bad = {...good,[key]:typeof good[key] === 'boolean' ? false : 1};
        assert.throws(() => observe(bad, good), undefined, 'must reject '+key);
      }
      console.log('shell-hang observer rejected'); process.exitCode = 1;
    }
  }
} else {
  const {When,Then} = require('@cucumber/cucumber');
  When('I run the bounded shell CLI fixture {string}', {timeout:90000}, async function(mode) { this.shellHang = await exercise(mode); });
  Then('the bounded shell observations are:', function(text) { observe(this.shellHang, JSON.parse(text)); });
}
