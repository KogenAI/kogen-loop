'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = process.cwd();
const owned = [];
function temp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'timeout-custody-')); fs.chmodSync(d, 0o700); owned.push(d); return d; }
function cleanup() { for (const d of owned) fs.rmSync(d, {recursive:true, force:true}); owned.length = 0; }
function env(d) {
  for (const n of ['home','tmp','cache','gopath']) fs.mkdirSync(path.join(d,n), {mode:0o700});
  return {PATH:process.env.PATH, LC_ALL:'en_US.UTF-8', HOME:path.join(d,'home'), TMPDIR:path.join(d,'tmp'),
    GOCACHE:process.env.GOCACHE || path.join(d,'cache'), GOPATH:path.join(d,'gopath'), GOENV:'off', GOTOOLCHAIN:'local', GOPROXY:'off', GOSUMDB:'off'};
}
function execute(config, mask='077', name='TestTimeoutCustodyAcceptance') {
  assert.ok(['077','022'].includes(mask)); const d=temp();
  const overlay=path.join(d,'overlay.json'); fs.writeFileSync(overlay,JSON.stringify({Replace:{
    [path.join(root,'conformance/timeout_custody_acceptance_test.go')]:path.join(root,'features/steps/timeout_custody_liveness_test.go.txt')
  }}),{mode:0o600});
  const r=spawnSync('/bin/sh',['-c','umask "$1"; shift; exec go "$@"','timeout-custody',mask,'test','-json','-count=1','-timeout=45s','-overlay',overlay,'./conformance','-run','^'+name+'$'],
    {env:{...env(d),TC_CONFIG:JSON.stringify(config)},encoding:'utf8',timeout:120000,maxBuffer:16*1024*1024});
  return {status:r.status,signal:r.signal,error:r.error ? r.error.message : null,stdout:r.stdout||'',stderr:r.stderr||'',name};
}
function report(r) {
  assert.equal(r.error,null,'process.error'); assert.equal(r.signal,null,'process.signal');
  assert.equal(r.status,0,'process.status\n'+r.stdout+r.stderr); assert.equal(r.stderr,'','process.stderr');
  const events=r.stdout.trim().split('\n').map(x=>JSON.parse(x));
  assert.ok(events.length>0,'events.empty'); assert.ok(events.every(x=>x.Package==='kogen-loop/conformance'),'events.package');
  assert.ok(!events.some(x=>['skip','fail'].includes(x.Action)),'events.fail-or-skip');
  const count=(a,t)=>events.filter(x=>x.Action===a && x.Test===t).length;
  assert.equal(count('start',undefined),1); assert.equal(count('pass',undefined),1);
  assert.equal(count('run',r.name),1); assert.equal(count('pass',r.name),1);
  for (const x of events.filter(x=>x.Action==='run')) { assert.equal(count('run',x.Test),1); assert.equal(count('pass',x.Test),1); }
  const lines=events.filter(x=>x.Action==='output' && x.Test===r.name).map(x=>x.Output||'').join('').split('\n').filter(x=>x.startsWith('TCOBS '));
  assert.equal(lines.length,1,'payload.count'); return JSON.parse(lines[0].slice(6));
}
function equal(actual,expected) { assert.deepEqual(actual,expected,'payload.exact'); }
const scopeNew = ['sys/timeout_observation_darwin.go','sys/timeout_observation_linux.go','sys/timeout_observation_other.go',
  'sys/timeout_custody_liveness_test.go','tools/timeout_custody_liveness_test.go','loop/timeout_custody_liveness_test.go'];
const scopeOld = {'loop/loop.go':'868af0a4d829638e209849b453b163ff3316524d9c323cfd71ba2ff0de107fb3',
  'loop/session.go':'3d9804358be7fd9ab09a523f3187ef2a21d31ed34355de715b71ab8b518b871d'};
function projectedParent(source) {
  assert.equal(source.split('const skip = p => ').length,2,'guard.anchor');
  assert.equal(source.split('hash(fs.readFileSync(path.join(root, p)))').length,2,'guard.hash-anchor');
  const extra = '(root === \'.\' && ('+JSON.stringify(scopeNew)+'.includes(p) || p.startsWith(\'.kogen/intents/timeout-custody-liveness/\') || '+
    JSON.stringify(['features/steps/timeout_custody_liveness.js','features/steps/timeout_custody_liveness_test.go.txt'])+'.includes(p))) || ';
  return source.replace('const skip = p => ','const skip = p => '+extra)
    .replace('hash(fs.readFileSync(path.join(root, p)))',"(root === '.' && "+JSON.stringify(scopeOld)+"[p]) || hash(fs.readFileSync(path.join(root, p)))");
}
function parent() {
  const d=temp(), step=path.join(d,'parent.js'), feature=path.join(d,'parent.feature'), out=path.join(d,'messages.jsonl');
  fs.writeFileSync(step,projectedParent(fs.readFileSync('features/steps/caller_shell_bound.js','utf8')),{mode:0o600});
  fs.copyFileSync('.kogen/intents/caller-shell-bound/acceptance.feature',feature);
  const r=spawnSync(process.env.KOGEN_NODE||process.execPath,[path.join(process.env.KOGEN_CUCUMBER,'@cucumber/cucumber/bin/cucumber.js'),'--strict','--require',step,'--format','message:'+out,feature],
    {env:{...process.env,NODE_PATH:process.env.KOGEN_CUCUMBER},encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024});
  assert.equal(r.error,undefined,'parent.process.error'); assert.equal(r.signal,null); assert.equal(r.status,0,r.stdout+r.stderr);
  const frames=fs.readFileSync(out,'utf8').trim().split('\n').map(x=>JSON.parse(x));
  const cases=frames.filter(x=>x.pickle).map(x=>x.pickle.id);
  assert.equal(cases.length,24,'parent.scenario-count');
  const starts=frames.filter(x=>x.testCaseStarted).map(x=>x.testCaseStarted);
  assert.equal(starts.length,24); assert.equal(new Set(starts.map(x=>x.id)).size,24);
  const definitions=new Map(frames.filter(x=>x.testCase).map(x=>[x.testCase.id,x.testCase]));
  assert.deepEqual(starts.map(x=>definitions.get(x.testCaseId).pickleId).sort(),cases.slice().sort(),'parent.once-per-pickle');
  const finishes=frames.filter(x=>x.testCaseFinished).map(x=>x.testCaseFinished);
  assert.equal(finishes.length,24); assert.ok(finishes.every(x=>!x.willBeRetried));
  assert.deepEqual(finishes.map(x=>x.testCaseStartedId).sort(),starts.map(x=>x.id).sort());
  for (const start of starts) {
    const results=frames.filter(x=>x.testStepFinished && x.testStepFinished.testCaseStartedId===start.id).map(x=>x.testStepFinished);
    assert.deepEqual(results.map(x=>x.testStepId).sort(),definitions.get(start.testCaseId).testSteps.map(x=>x.id).sort(),'parent.complete-steps');
    assert.ok(results.length>0 && results.every(x=>x.testStepResult.status==='PASSED'),'parent.steps');
  }
  return true;
}
function focused() {
  const required={sys:['TestTimeoutCustodyBlockedObservation','TestTimeoutCustodyObservationError','TestTimeoutCustodyMembership'],
    tools:['TestTimeoutCustodyContextCalls'],loop:['TestTimeoutCustodySessionContext','TestTimeoutCustodyHookPrecedence']};
  for (const [pkg,names] of Object.entries(required)) {
    const r=spawnSync('go',['test','-json','-count=1','-timeout=45s','./'+pkg,'-run','^('+names.join('|')+')$'],{encoding:'utf8',timeout:90000,maxBuffer:16*1024*1024,env:{...process.env,GOPROXY:'off',GOSUMDB:'off'}});
    assert.equal(r.error,undefined); assert.equal(r.signal,null); assert.equal(r.status,0,r.stdout+r.stderr);
    const es=r.stdout.trim().split('\n').map(x=>JSON.parse(x));
    assert.ok(!es.some(x=>['skip','fail'].includes(x.Action)));
    for(const n of names) { assert.equal(es.filter(x=>x.Action==='run' && x.Test===n).length,1,'required.run.'+n); assert.equal(es.filter(x=>x.Action==='pass' && x.Test===n).length,1,'required.pass.'+n); }
  }
  return true;
}
function model() {
  const f='.kogen/intents/timeout-custody-liveness/model.qnt';
  const run=args=>spawnSync(process.env.KOGEN_NODE,[process.env.KOGEN_QUINT,...args],{encoding:'utf8',timeout:30000});
  const tc=run(['typecheck',f]); assert.equal(tc.status,0,tc.stdout+tc.stderr);
  for (const [step,status] of [['step',0],['mutantStep',1]]) {
    const r=run(['run',f,'--backend=typescript','--step='+step,'--invariant=Truthful and StopWins and Custody and Progress and Precedence','--seed=17','--max-samples=100','--max-steps=30','--verbosity=1']);
    assert.equal(r.error,undefined); assert.equal(r.signal,null); assert.equal(r.status,status,r.stdout+r.stderr);
    if(status) assert.match(r.stdout+r.stderr,/Invariant violated/);
  }
}
function scopeControl(kind) {
  const src=projectedParent(fs.readFileSync('features/steps/caller_shell_bound.js','utf8'));
  const body=src.slice(src.indexOf('function preservationDigest('),src.indexOf('function cleanup()'));
  const hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
  const digest=new Function('fs','path','hash','assert',body+'\nreturn preservationDigest;')(fs,path,hash,assert);
  const d=temp(), previous=process.cwd();
  function put(p,b) {fs.mkdirSync(path.dirname(path.join(d,p)),{recursive:true,mode:0o700});fs.writeFileSync(path.join(d,p),b,{mode:0o600});}
  put('kept','original');put('loop/loop.go','old');put('loop/session.go','old');
  try {
    process.chdir(d);const base=digest();
    put('loop/loop.go','changed');put('loop/session.go','changed');
    for(const p of scopeNew) put(p,'permitted');
    put('.kogen/intents/timeout-custody-liveness/intent.md','permitted');
    put('features/steps/timeout_custody_liveness.js','permitted');
    put('features/steps/timeout_custody_liveness_test.go.txt','permitted');
    put('README.md','historically excluded');assert.equal(digest(),base,'scope.approved-only');
    if(kind==='bad') {put('kept','unauthorized');assert.notEqual(digest(),base,'scope.consumes-unapproved-bytes');}
  } finally {process.chdir(previous);}
}
function control(kind,mask) {
  assert.ok(['good','bad'].includes(kind));
  const good=report(execute({mode:'direct',fault:false,actor:'zombie'},mask));
  const want={error:'',timedOut:true,text:'partial\n',published:0,requests:0,ending:'',laterEffect:false,returnedInput:false,faultHeld:false,leaderGone:true,actorGone:true,prompt:true,held:true,escaped:false};
  equal(good,want);
  // Exercise the real resource-fault predicate even when positive-timeout red masks it.
  const stop={...want,error:'context.Canceled',timedOut:false,text:'',requests:1,faultHeld:true};
  equal(report(execute({mode:'default',fault:true,actor:'none'},mask)),{...stop,held:false});
  equal(report(execute({mode:'interrupt',fault:true,actor:'zombie'},mask)),{...stop,error:'interrupted SIGINT'});
  equal(report(execute({},mask,'TestTimeoutCustodyHost')),{zombieVisible:true,zombieGetpgidESRCH:true,underFaultVisible:true,reapedEmpty:true});
  scopeControl(kind);
  const event=(Action,Output)=>({Package:'kogen-loop/conformance',Action,...(Action==='start'?{}:{Test:'TestTimeoutCustodyAcceptance'}),...(Output?{Output}:{})});
  function synthetic(v) {
    const line='TCOBS '+JSON.stringify(v)+'\n';
    const es=[event('start'),event('run'),event('output',line.slice(0,17)),event('output',line.slice(17)),event('pass'),{Package:'kogen-loop/conformance',Action:'pass'}];
    return {status:0,signal:null,error:null,stderr:'',stdout:es.map(x=>JSON.stringify(x)).join('\n')+'\n',name:'TestTimeoutCustodyAcceptance'};
  }
  equal(report(synthetic(want)),want);
  equal(report(synthetic(stop)),stop);
  if(kind==='bad') {
    const reject=fn=>{let caught;try{fn();}catch(e){caught=e;}assert.ok(caught,'negative missed assertion');};
    for(const base of [want,stop]) for(const [k,v] of Object.entries(base)) {
      const bad={...base,[k]:typeof v==='boolean'?!v:typeof v==='number'?v+1:v+'!'};
      reject(()=>equal(report(synthetic(bad)),base));
    }
    for(const mutate of [r=>r.status=1,r=>r.signal='SIGKILL',r=>r.error='watchdog',r=>r.stderr='compile error',
      r=>r.stdout='compile error',r=>r.stdout+=JSON.stringify(event('skip'))+'\n',
      r=>r.stdout+=JSON.stringify(event('output','TCOBS {}\n'))+'\n',
      r=>r.stdout=r.stdout.split('\n').filter((_,i)=>i!==3).join('\n')]) {
      const r=synthetic(want);mutate(r);reject(()=>report(r));
    }
    const src=fs.readFileSync('features/steps/caller_shell_bound.js','utf8');
    reject(()=>projectedParent(src.replace('const skip = p => ','const lost = p => ')));
    process.stdout.write('timeout-custody observer bad rejected '+mask+'\n');process.exitCode=1;
  } else process.stdout.write('timeout-custody observer good '+mask+'\n');
}
if(require.main===module) {
  try {
    if(process.argv[2]==='--control') control(process.argv[3],process.argv[4]);
    else if(process.argv[2]==='--host') {
      equal(report(execute({},'077','TestTimeoutCustodyHost')),{zombieVisible:true,zombieGetpgidESRCH:true,underFaultVisible:true,reapedEmpty:true});
      process.stdout.write('timeout-custody native host supported\n');
    } else { assert.equal(process.argv[2],'--model');model();process.stdout.write('timeout-custody model accepts progress and rejects ignored stop\n'); }
  } catch(e) {console.error(e.stack);process.exitCode=2;} finally {cleanup();}
} else {
  const {Given,When,Then,AfterAll}=require('@cucumber/cucumber');
  Given('timeout custody inputs are:',function(s){this.tc=JSON.parse(s);});
  When('I exercise timeout custody with umask {string}',{timeout:150000},function(mask){this.tcResult=execute(this.tc,mask);});
  Then('timeout custody reports exactly:',function(s){equal(report(this.tcResult),JSON.parse(s));});
  When('I execute the complete parent shell-bound contract with the approved scope projection',{timeout:310000},function(){this.tcParent=parent();});
  Then('every original parent scenario passes exactly once',function(){assert.equal(this.tcParent,true);});
  When('I run the focused timeout custody implementation regressions',{timeout:280000},function(){this.tcFocused=focused();});
  Then('all required timeout custody regression tests run and pass',function(){assert.equal(this.tcFocused,true);});
  AfterAll(cleanup);
}
