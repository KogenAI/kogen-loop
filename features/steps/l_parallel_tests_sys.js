'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const packages = ['kogen-loop/sys', 'kogen-loop/tools', 'kogen-loop/loop'];
const base = 'c7deffb648f6fff64b545f57aa71e33517ef6af2';
function command(cmd, args, cwd) {
  const start = Date.now();
  const r = spawnSync(cmd, args, {cwd, env:{...process.env,LC_ALL:'en_US.UTF-8',LANG:'en_US.UTF-8'}, encoding:'utf8', maxBuffer:128*1024*1024});
  const ev = (r.stdout || '').split('\n').flatMap(s => {try {return [JSON.parse(s)];} catch {return [];}});
  const failed = new Set(ev.filter(e => e.Test && e.Action === 'fail').map(e => e.Package + '/' + e.Test));
  const diagnostic = ev.length ? ev.filter(e => e.Action === 'fail' || (e.Action === 'output' && failed.has(e.Package + '/' + e.Test))).map(e => e.Output || JSON.stringify(e)).join('\n') : (r.stdout || '').slice(-8000);
  assert.ok(!r.error && r.status === 0, `${cmd} ${args.join(' ')} (cwd ${cwd}): exit ${r.status}, ${r.error || ''}\n${diagnostic}\n${r.stderr}`);
  return {text:r.stdout, wall:(Date.now()-start)/1000, events:ev, command:'LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8 '+cmd+' '+args.join(' ')};
}
function run(cwd, race) {
  return command('go',['test','-json','-count=1',...(race ? ['-race'] : []),'./sys','./tools','./loop'],cwd);
}
// Per-top-level terminal counts preserve dynamic subtest coverage without comparing
// the existing random TempDir name literally. Do not rename that test.
function counts(r, pkg) {
  const c = {};
  for (const e of r.events) {
    if (e.Package !== pkg || !e.Test || !['pass','skip','fail'].includes(e.Action)) continue;
    const key = e.Test.split('/')[0] + ':' + e.Action;
    c[key] = (c[key] || 0) + 1;
  }
  return c;
}
function checkRun(r, expected, parallel) {
  for (const pkg of packages) {
    const ends = r.events.filter(e => e.Package === pkg && !e.Test && ['pass','fail','skip'].includes(e.Action));
    assert.equal(ends.length, 1, `${r.command}: ${pkg} package result missing/duplicated`);
    assert.equal(ends[0].Action, 'pass', `${r.command}: ${pkg} did not pass`);
    const actual = counts(r, pkg);
    assert.ok(Object.keys(actual).length, `${r.command}: ${pkg} tests absent (ran zero times)`);
    if (expected) for (const key of new Set([...Object.keys(expected[pkg]), ...Object.keys(actual)])) {
      assert.equal(actual[key] || 0, expected[pkg][key] || 0, `${r.command}: required test ${pkg}/${key}: absent, skipped or changed terminal count; actual ${actual[key] || 0}, expected ${expected[pkg][key] || 0}`);
    }
    if (parallel) {
      const paused = new Set(r.events.filter(e => e.Package === pkg && e.Action === 'pause' && e.Test && !e.Test.includes('/')).map(e => e.Test));
      const continued = new Set(r.events.filter(e => e.Package === pkg && e.Action === 'cont').map(e => e.Test));
      assert.ok([...paused].filter(n => continued.has(n)).length >= 2, `${r.command}: ${pkg} needs independent top-level parallel tests`);
    }
  }
}
const median = xs => [...xs].sort((a,b) => a-b)[Math.floor(xs.length/2)];
function judge(data) {
  const expected = Object.fromEntries(packages.map(p => [p, counts(data.before[0],p)]));
  for (const r of data.before) checkRun(r, expected, false);
  for (const r of data.after) checkRun(r, expected, true);
  checkRun(data.raceBefore, expected, false);
  checkRun(data.raceAfter, expected, true);
  assert.ok(median(data.after.map(r => r.wall)) < median(data.before.map(r => r.wall)), 'uncached combined sys/tools/loop median wall did not decrease');
}
function fixture() {
  function r(parallel, wall) {
    return {wall, command:'fixture go test ./sys ./tools ./loop', events:packages.flatMap(Package => [
      ...['TestA','TestB'].flatMap(Test => [...(parallel ? [{Package,Test,Action:'pause'},{Package,Test,Action:'cont'}] : []),{Package,Test,Action:'pass'}]),{Package,Action:'pass'}])};
  }
  return {before:[r(false,4),r(false,5),r(false,6)],after:[r(true,1),r(true,2),r(true,3)],raceBefore:r(false,5),raceAfter:r(true,2)};
}
function measure() {
  assert.equal(process.platform,'darwin','acceptance measurements require the MacBook');
  console.log(command('go',['version'],process.cwd()).text.trim());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'loop-parallel-baseline-'));
  try {
    const archive = path.join(dir,'base.tar');
    // Read only the immutable supplied commit, never the source worktree.
    command('git',['-C','/Users/kogen-runner/work.noindex/src/l-parallel-tests-sys','archive','--format=tar','--output='+archive,base],process.cwd());
    command('tar',['-xf',archive,'-C',dir],process.cwd());
    const before = [], after = [];
    function record(label,r) {
      console.log(JSON.stringify({label,command:r.command,wall:r.wall,packages:r.events.filter(e => !e.Test && e.Action === 'pass').map(e => ({package:e.Package,elapsed:e.Elapsed})),counts:Object.fromEntries(packages.map(p => [p,counts(r,p)]))}));
      return r;
    }
    for (let i=0;i<3;i++) { before.push(record('before',run(dir,false))); after.push(record('after',run(process.cwd(),false))); }
    const raceBefore = record('raceBefore',run(dir,true)), raceAfter = record('raceAfter',run(process.cwd(),true));
    console.log('Uncached -count=1; process wall excludes external queue wait. Compare per-top-level terminal test/subtest counts, not random TempDir names.');
    judge({before,after,raceBefore,raceAfter});
    console.log(command('go',['test','./...'],process.cwd()).text);
    console.log('measurement accepted');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
if (require.main === module) {
  if (process.argv[2] === '--measure') measure();
  else if (process.argv[2] === 'good') {judge(fixture()); console.log('observer accepted');}
  else {
    const mutations = [
      d => {d.after[0].events = d.after[0].events.filter(e => e.Test !== 'TestB');},
      d => {d.after[0].events = d.after[0].events.filter(e => e.Action !== 'pause');},
      d => {d.after[0].events.find(e => !e.Test).Action = 'fail';},
      d => {d.raceAfter.events.find(e => e.Test && e.Action === 'pass').Action = 'skip';},
      d => {d.after.forEach(r => {r.wall = 10;});}
    ];
    let rejected = 0;
    for (const mutate of mutations) {const d = fixture(); mutate(d); try {judge(d);} catch {rejected++;}}
    assert.equal(rejected, mutations.length, 'observer accepted a bad report');
    console.log('observer rejected 5 bad reports'); process.exitCode = 1;
  }
} else {
  const {When,Then} = require('@cucumber/cucumber');
  When('I run uncached sys tools and loop tests', {timeout:110000}, function () {this.sysParallelRun = run(process.cwd(),false);});
  Then('each scoped package passes with independent top-level parallel tests', function () {checkRun(this.sysParallelRun,null,true);});
}
