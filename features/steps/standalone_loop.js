'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {spawn, spawnSync} = require('node:child_process');
const REF = '/Users/almirsarajcic/Areas/Kogen/studio-work/kogen-loop-extraction-20261026/sprint-30min';
const hash = b => crypto.createHash('sha256').update(b).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let binary, binaryDir;

// Objects allow additive v1 fields. Arrays and strings remain ordered and exact.
function includes(actual, expected, label = '$') {
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${label}: not an array`);
    assert.equal(actual.length, expected.length, `${label}: array length`);
    expected.forEach((v, i) => includes(actual[i], v, `${label}[${i}]`));
  } else if (expected !== null && typeof expected === 'object') {
    assert.ok(actual !== null && typeof actual === 'object' && !Array.isArray(actual), `${label}: not an object`);
    for (const [key, value] of Object.entries(expected)) {
      assert.ok(Object.hasOwn(actual, key), `${label}.${key}: missing`);
      includes(actual[key], value, `${label}.${key}`);
    }
  } else assert.deepEqual(actual, expected, label);
}

function verify(actual, expected) {
  if (actual.events) {
    assert.ok(actual.events.length > 0, 'empty JSONL stream');
    assert.equal(actual.credentialsSafe, true, 'credential appeared in process output');
    for (const [i, event] of actual.events.entries()) {
      assert.equal(event.protocol, 'kogen-loop/v1');
      assert.equal(event.seq, i + 1);
      assert.match(event.time, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/);
      assert.ok(Number.isFinite(Date.parse(event.time)), 'invalid RFC3339 timestamp');
      for (const key of ['success', 'verified', 'approved', 'completed']) assert.ok(!Object.hasOwn(event, key), `policy field ${key}`);
    }
    const ends = actual.events.filter(e => e.type === 'session.ended');
    assert.equal(ends.length, 1);
    assert.equal(actual.events.at(-1).type, 'session.ended');
    assert.equal(ends[0].exit, actual.exit);
  }
  includes(actual, expected);
}

function command(exe, args, options = {}) {
  const p = spawnSync(exe, args, {encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024, ...options});
  if (p.error) throw p.error;
  assert.equal(p.status, 0, `${exe} ${args.join(' ')}\n${p.stdout}\n${p.stderr}`);
  return p.stdout;
}

function cliBinary() {
  if (!binary) {
    binaryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-loop-bin-'));
    binary = path.join(binaryDir, 'kogen-loop');
    try { command('go', ['build', '-o', binary, './cmd/kogen-loop']); }
    catch (e) { binary = undefined; throw e; }
  }
  return binary;
}

function gone(pid) {
  try { process.kill(pid, 0); return false; }
  catch (e) { if (e.code === 'ESRCH') return true; throw e; }
}

async function waitGone(pid) {
  for (let i = 0; i < 100; i++) { if (gone(pid)) return true; await sleep(50); }
  return false;
}

async function runCLI(c) {
  const bin = cliBinary();
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'native-loop-task-'));
  const root = path.join(base, 'root'), home = path.join(base, 'home'), tmp = path.join(base, 'tmp');
  for (const dir of [root, home, tmp]) fs.mkdirSync(dir, {mode: 0o700});
  let fixture = {};
  if (c.fixture) fixture = JSON.parse(fs.readFileSync(path.join('conformance/testdata', c.fixture + '.json'), 'utf8'));
  for (const [name, text] of Object.entries({...fixture.files, ...c.files})) fs.writeFileSync(path.join(root, name), text);
  const creds = path.join(home, '.kogen/credentials');
  fs.mkdirSync(creds, {recursive: true, mode: 0o700});
  fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now()/1000)+3600}), {mode:0o600});
  const requests = [], faults = [];
  const exchanges = c.exchanges || fixture.exchanges || [];
  const server = http.createServer(async (req, res) => {
    try {
      let body = ''; for await (const chunk of req) body += chunk;
      const index = requests.length;
      requests.push(JSON.parse(body));
      assert.equal(req.url, '/v1/responses');
      assert.equal(req.method, 'POST');
      const ex = exchanges[index];
      if (!ex) throw new Error('recording exhausted');
      res.writeHead(200, {'content-type':'text/event-stream', 'x-request-id':'req-native'});
      for (const [i, item] of ex.items.entries()) res.write('data: '+JSON.stringify({type:'response.output_item.done',output_index:i,item})+'\n\n');
      res.end('data: '+JSON.stringify({type:'response.completed',response:{status:'completed',...(ex.id ? {id:ex.id} : {}),...(ex.usage ? {usage:ex.usage} : {})}})+'\n\n');
    } catch (e) {
      faults.push(e.message);
      if (!res.headersSent) res.writeHead(400, {'content-type':'application/json'});
      res.end(JSON.stringify({error:{message:'scripted refusal',code:'invalid_request_error'}}));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const task = {protocol:'kogen-loop/v1',root,role:{provider:'chatgpt',model:'fixture-model',effort:'medium',base_url:''},instructions:'',prompt:'do the thing',tools:['read_file','write_file','list_files','search_text','shell'],protected:[],excluded:[],terminal:[],deadline_seconds:0,session:{dir:'',resume:false},requires:[],...fixture.task,...c.task};
  const input = Object.hasOwn(c, 'raw') ? c.raw : JSON.stringify(task);
  const taskPath = path.join(base, 'task.json'); fs.writeFileSync(taskPath, input);
  const env = {HOME:home,TMPDIR:tmp,PATH:process.env.PATH,KOGEN_PROVIDER_URL:`http://127.0.0.1:${server.address().port}`};
  let child, timer, stdout = '', stderr = '', timedOut = false, pids = [];
  try {
    child = spawn(bin, ['run','--task',c.stdin ? '-' : taskPath], {env, stdio:['pipe','pipe','pipe']});
    child.stdout.on('data', b => { stdout += b; });
    child.stderr.on('data', b => { stderr += b; });
    child.stdin.on('error', () => {});
    const finished = new Promise((resolve, reject) => { child.once('error', reject); child.once('close', (code, signal) => resolve({code,signal})); });
    child.stdin.end(c.stdin ? input : undefined);
    timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 25000);
    if (c.children) {
      for (let i = 0; i < 300; i++) {
        if (['pid-sh','pid-sleep'].every(n => fs.existsSync(path.join(root,n)))) {
          pids = ['pid-sh','pid-sleep'].map(n => Number(fs.readFileSync(path.join(root,n),'utf8').trim()));
          if (pids.every(n => Number.isInteger(n) && n > 1)) break;
          pids = [];
        }
        await sleep(50);
      }
      assert.equal(pids.length, 2, 'running shell and child never published valid PIDs');
      assert.ok(pids.every(pid => !gone(pid)), 'child was not alive before cancellation');
      if (c.signal) child.kill(c.signal);
    }
    const end = await finished;
    clearTimeout(timer);
    assert.equal(timedOut, false, `CLI timeout: ${stderr}`);
    assert.equal(end.signal, null, `CLI killed instead of reporting an exit: ${stderr}`);
    assert.equal(faults.length, 0, faults.join('\n'));
    assert.ok(stdout.endsWith('\n'), 'JSONL lacks final newline');
    const events = stdout.trimEnd().split('\n').map(line => JSON.parse(line));
    const outputs = requests.flatMap(r => (r.input || []).filter(it => it.type === 'function_call_output'));
    const deliveries = outputs.map(out => {
      const text = out.output;
      assert.equal(typeof text, 'string');
      const event = events.find(e => e.type === 'tool.result' && e.call_id === out.call_id);
      return {call_id:out.call_id,bytes:Buffer.byteLength(text),bounded:Buffer.byteLength(text)<=16384,marker:text.includes('bytes omitted'),hashMatches:event?.result_sha256 === hash(text),bytesMatch:event?.bytes === Buffer.byteLength(text)};
    });
    const files = {}; for (const name of c.inspect || []) files[name] = fs.existsSync(path.join(root,name)) ? fs.readFileSync(path.join(root,name),'utf8') : null;
    const processesGone = []; for (const pid of pids) processesGone.push(await waitGone(pid));
    const credentialsSafe = !['fake-access-token','fake-refresh-token'].some(token => stdout.includes(token) || stderr.includes(token));
    return {exit:end.code,requestCount:requests.length,eventTypes:events.map(e=>e.type),events,outputs,deliveries,files,processesGone,credentialsSafe};
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null) child.kill('SIGKILL');
    for (const pid of pids) {
      try { process.kill(-pid, 'SIGKILL'); } catch (_) {}
      try { process.kill(pid, 'SIGKILL'); } catch (_) {}
    }
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(base, {recursive:true,force:true});
  }
}

async function exercise(mode, c) {
  if (mode === 'cli') return runCLI(c);
  if (mode === 'library') return JSON.parse(command('go', ['run','features/steps/loop_driver.go'], {input:JSON.stringify(c)}));
  if (mode === 'capabilities') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'loop-no-login-'));
    try { return JSON.parse(command(cliBinary(),['capabilities','--json'], {env:{HOME:dir,PATH:process.env.PATH,TMPDIR:dir,KOGEN_PROVIDER_URL:'http://127.0.0.1:1'}})); }
    finally { fs.rmSync(dir,{recursive:true,force:true}); }
  }
  if (mode === 'checks') {
    const results = [];
    for (const args of [['test','-race','./...'],['test','./conformance','-count=1'],['vet','./...'],['build','-o','/dev/null','./...']]) {
      const output = command('go',args);
      results.push({command:'go '+args.join(' '),passed:true,suites:args[0] === 'test' ? ['conformance','provider','sys','tools'].filter(name => new RegExp('(?:ok|\\?)\\s+kogen-loop/'+name+'(?:\\s|$)').test(output)) : []});
    }
    return {results};
  }
  if (mode === 'adoption') {
    const original = fs.readFileSync(path.join(REF,'loop-reference-manifest.json'));
    const manifest = JSON.parse(original);
    const retained = fs.readFileSync('docs/provenance/loop-reference-manifest.json');
    assert.deepEqual(JSON.parse(retained),manifest);
    const unchanged = entry => fs.existsSync(entry.path) && hash(fs.readFileSync(entry.path)) === entry.sha256;
    const compatible = manifest.filter(e => /^(provider|tools|sys)\//.test(e.path));
    const tests = manifest.filter(e => /(?:_test\.go|testdata\/)/.test(e.path));
    const readme = fs.readFileSync('README.md','utf8');
    const provenance = fs.readFileSync('docs/provenance/extraction.md','utf8');
    return {archive:hash(fs.readFileSync(path.join(REF,'loop-reference.tar.gz'))),manifest:hash(retained),allSourcePresent:manifest.every(e=>fs.existsSync(e.path)),compatibilityBytes:compatible.every(unchanged),referenceTestsIntact:tests.every(unchanged),license:unchanged(manifest.find(e=>e.path==='LICENSE')),notice:unchanged(manifest.find(e=>e.path==='NOTICE')),referenceReadme:hash(fs.readFileSync('docs/provenance/reference-README.md'))===manifest.find(e=>e.path==='README.md').sha256,bootstrapRemoved:!fs.existsSync('main.go'),module:fs.readFileSync('go.mod','utf8').split('\n')[0],modules:command('go',['list','-m','all']).trim().split('\n'),noAgents:!fs.existsSync('AGENTS.md'),readmeNavigation:c.links.every(p=>readme.includes(p)&&fs.existsSync(p)),bootstrapProvenance:readme.includes('go mod init kogen-loop'),provenanceComplete:c.provenance.every(text=>provenance.includes(text))};
  }
  throw new Error('unknown exercise '+mode);
}

// Focused controls use these exact observer bytes, including deep postconditions.
// The live child is an independent control for the PID observer, not product evidence.
async function controls(kind) {
  const child = spawn('/bin/sh',['-c','exec sleep 30']);
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  assert.equal(gone(child.pid),false);
  const closed = new Promise(resolve=>child.once('close',resolve));
  child.kill('SIGKILL'); await closed;
  const good = {exit:0,credentialsSafe:true,events:[{protocol:'kogen-loop/v1',seq:1,time:'2026-10-26T00:00:00Z',type:'session.ended',status:'ended',exit:0}],ending:'terminal',terminal:'last',usage:{input:null,state:'unknown'},processesGone:[await waitGone(child.pid),true],deliveries:[{bounded:true,hashMatches:true,bytesMatch:true}],outputs:[{call_id:'before'},{call_id:'after'}]};
  const expected = structuredClone(good);
  verify(good,expected);
  if (kind === 'good') { process.stdout.write('observer good\n'); return; }
  assert.equal(kind,'bad');
  const mutations = [
    o=>o.events[0].seq=2, o=>o.events[0].time='not a time', o=>o.events[0].protocol='other/v1',
    o=>o.events[0].verified=true, o=>o.events.push({...o.events[0],seq:2}),
    o=>o.events[0].type='round.ended', o=>o.events[0].exit=1, o=>o.credentialsSafe=false,
    o=>o.terminal='first', o=>o.usage.input=0, o=>o.usage.state='complete',
    o=>o.processesGone[1]=false, o=>o.deliveries[0].bounded=false,
    o=>o.deliveries[0].hashMatches=false, o=>o.deliveries[0].bytesMatch=false,
    o=>o.outputs.reverse(), o=>o.outputs.push({call_id:'terminal'}), o=>delete o.terminal
  ];
  for (const mutate of mutations) {
    const bad=structuredClone(good); mutate(bad);
    let rejected=false; try { verify(bad,expected); } catch (_) { rejected=true; }
    if (!rejected) { process.stdout.write('observer accepted a bad fixture\n'); return; }
  }
  process.stdout.write('observer bad rejected\n'); process.exitCode=1;
}

if (require.main === module) {
  const job = process.argv[2] === '--control' ? controls(process.argv[3]) : exercise(process.argv[2], JSON.parse(fs.readFileSync(0,'utf8'))).then(o=>process.stdout.write(JSON.stringify(o)+'\n'));
  job.catch(e=>{console.error(e.stack);process.exitCode=2;}).finally(()=>{if(binaryDir)fs.rmSync(binaryDir,{recursive:true,force:true});});
} else {
  const {Given,When,Then,AfterAll,setDefaultTimeout} = require('@cucumber/cucumber');
  setDefaultTimeout(240000);
  Given('the independent loop input is:',function(text){this.loopInput=JSON.parse(text);});
  When('I exercise the standalone loop through {string}',async function(mode){this.loopObservation=await exercise(mode,this.loopInput);});
  Then('the independent loop observation includes:',function(text){verify(this.loopObservation,JSON.parse(text));});
  AfterAll(function(){if(binaryDir)fs.rmSync(binaryDir,{recursive:true,force:true});});
}
