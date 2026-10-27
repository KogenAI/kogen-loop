'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const root = process.cwd();
const fixture = path.join(root,'features/steps/linux_timeout_observation_test.go.txt');
const rows = ['live','zombie','synthetic-zombie','vanished','eperm','eacces','error-before-member','malformed','listing','guard-1','guard-0','guard-negative'];
function run(args, env={}) {
  const r=spawnSync('/bin/sh',args,{cwd:root,env:{...process.env,GOTOOLCHAIN:'local',GOPROXY:'off',GOSUMDB:'off',...env},encoding:'utf8',timeout:180000,maxBuffer:32*1024*1024});
  assert.equal(r.error,undefined); assert.equal(r.signal,null); return r;
}
function decisions(mask, control=false, mutant='') {
  assert.ok(['077','022'].includes(mask)); assert.equal(os.platform(),'darwin','Darwin execution required');
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'linux-timeout-')); fs.chmodSync(d,0o700);
  try {
    const replace={[path.join(root,'sys/linux_timeout_shape_test.go')]:fixture};
    if(control) {
      const shim=path.join(d,'shim.go');
      fs.writeFileSync(shim,'package sys\nimport "io/fs"\nfunc linuxTimeoutGroupAlive(p int, f fs.FS)(bool,error){return ltoReference(p,f)}\n',{mode:0o600});
      replace[path.join(root,'sys/timeout_observation_proc.go')]=shim;
    }
    const overlay=path.join(d,'overlay.json'); fs.writeFileSync(overlay,JSON.stringify({Replace:replace}),{mode:0o600});
    return run(['-c','umask "$1"; shift; exec go "$@"','lto',mask,'test','-json','-count=1','-timeout=40s','-overlay',overlay,'./sys','-run','^TestLinuxTimeoutShape$'],{LTO_MUTANT:mutant});
  } finally {fs.rmSync(d,{recursive:true,force:true});}
}
function events(r) {
  assert.equal(r.stderr,'','unexpected diagnostics');
  const es=r.stdout.trim().split('\n').map(x=>JSON.parse(x));
  assert.ok(es.length); assert.ok(es.every(x=>x.Package==='kogen-loop/sys')); return es;
}
function observe(r, wanted) {
  assert.equal(r.status,0,r.stdout+r.stderr); const es=events(r);
  assert.ok(!es.some(x=>['fail','skip'].includes(x.Action)));
  for(const action of ['run','pass']) {
    const got=es.filter(x=>x.Action===action && x.Test && x.Test.startsWith('TestLinuxTimeoutShape/')).map(x=>x.Test.slice('TestLinuxTimeoutShape/'.length));
    assert.deepEqual(got,wanted);
    assert.equal(es.filter(x=>x.Action===action && x.Test==='TestLinuxTimeoutShape').length,1);
  }
  assert.equal(es.filter(x=>x.Action==='pass' && !x.Test).length,1);
}
function controls(kind,mask) {
  assert.ok(['good','bad'].includes(kind)); observe(decisions(mask,true),rows);
  if(kind==='bad') {
    const mutants={esrchFatal:'vanished',skipUnreadable:'eperm',killAbsent:'synthetic-zombie',epermFatal:'zombie',firstUnreadableAbsent:'error-before-member'};
    for(const [mutant,row] of Object.entries(mutants)) {
      const r=decisions(mask,true,mutant); assert.notEqual(r.status,0,'mutant survived '+mutant);
      const es=events(r); assert.ok(es.some(x=>x.Action==='fail' && x.Test==='TestLinuxTimeoutShape/'+row),'mutant did not reach decisive row '+mutant);
    }
    process.stdout.write('linux-timeout observer rejected five mutants '+mask+'\n');process.exitCode=1;
  } else process.stdout.write('linux-timeout observer good '+mask+'\n');
}
function compilation() {
  assert.equal(os.platform(),'darwin');
  const source=fs.readFileSync('sys/linux_timeout_observation_linux_test.go','utf8');
  assert.match(source,/\/\/go:build linux/);
  for(const n of ['Churn','Zombie','Moved','Agreement']) assert.match(source,new RegExp('func TestLinuxTimeoutObservation'+n+'\\('));
  const targets=['linux/amd64','linux/arm64','darwin/amd64','darwin/arm64','freebsd/amd64','freebsd/arm64'];
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'linux-timeout-compile-'));
  try {
    for(const target of targets) {
      const [GOOS,GOARCH]=target.split('/');
      for(const args of [['vet','./sys'],['test','-c','-o',path.join(d,GOOS+'-'+GOARCH+'.test'),'./sys'],['build','-o','/dev/null','./...']]) {
        const r=run(['-c','exec go "$@"','lto',...args],{GOOS,GOARCH,CGO_ENABLED:'0'});
        assert.equal(r.status,0,target+' compile-only '+r.stdout+r.stderr);
      }
    }
  } finally {fs.rmSync(d,{recursive:true,force:true});}
  return targets;
}
function preservation() {
  const skip=new Set(['README.md','docs/contract/loop-v1.md','sys/timeout_observation_linux.go','sys/timeout_observation_proc.go','sys/linux_timeout_observation_test.go','sys/linux_timeout_observation_linux_test.go','features/steps/linux_timeout_observation.js','features/steps/linux_timeout_observation_test.go.txt']);
  const items=[]; const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
  function walk(dir='') {
    for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) {
      const p=dir ? dir+'/'+entry.name : entry.name;
      if(p==='.git' || p==='.kogen/intents/linux-timeout-observation') continue;
      if(entry.isDirectory()) walk(p); else if(!skip.has(p)) {assert.ok(entry.isFile(),'unexpected nonregular '+p);items.push([p,hash(fs.readFileSync(path.join(root,p)))]);}
    }
  }
  walk();items.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  for(const p of ['README.md','docs/contract/loop-v1.md']) {
    const text=fs.readFileSync(p,'utf8');
    for(const re of [/27 October 2026/,/ESRCH/,/ENOENT/,/EPERM/,/hidepid/,/Darwin/,/Linux/,/pending/i]) assert.match(text,re,p);
    assert.doesNotMatch(text,/not host lifecycle-proven here|not proven here/);
  }
  return hash(JSON.stringify(items));
}
if(require.main===module) {
  try {assert.equal(process.argv[2],'--control');controls(process.argv[3],process.argv[4]);}
  catch(e){console.error(e.stack);process.exitCode=2;}
} else {
  const {When,Then}=require('@cucumber/cucumber');
  When('I qualify Linux timeout decisions with umask {string}',{timeout:190000},function(mask){this.lto=decisions(mask);});
  Then('these Linux timeout decision rows pass exactly once:',function(s){observe(this.lto,JSON.parse(s));});
  When('I cross-compile Linux timeout qualification',{timeout:1200000},function(){this.ltoTargets=compilation();});
  Then('Linux runtime proof remains pending and these targets compiled:',function(s){assert.deepEqual(this.ltoTargets,JSON.parse(s));});
  When('I inspect Linux timeout preservation and documentation',function(){this.ltoDigest=preservation();});
  Then('the Linux timeout preservation digest is {string}',function(s){assert.equal(this.ltoDigest,s);});
}
