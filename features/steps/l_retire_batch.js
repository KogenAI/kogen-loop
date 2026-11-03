'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
function run(mode){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'retire-batch-'));
 try {
  for(const name of ['go.mod','go.sum','api','loop','provider','tools','sys','internal']) {
   if(fs.existsSync(name)) fs.cpSync(name,path.join(dir,name),{recursive:true});
  }
  fs.copyFileSync(path.join(__dirname,'l_retire_batch_test.go.txt'),path.join(dir,'loop','zz_retire_batch_accept_test.go'));
  const args=['test','-json','-count=1','-timeout=60s','-run','^TestAcceptRetireBatch$','./loop'];
  const r=spawnSync('go',args,{cwd:dir,env:{...process.env,RETIRE_BATCH_CONTROL:mode==='good'?'round':''},encoding:'utf8',timeout:90000,maxBuffer:16<<20});
  const raw=(r.stdout||'')+(r.stderr||'');
  const events=(r.stdout||'').split('\n').flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});
  const ran=events.some(e=>e.Test==='TestAcceptRetireBatch'&&e.Action==='run');
  const passed=events.some(e=>e.Test==='TestAcceptRetireBatch'&&e.Action==='pass');
  const failed=events.some(e=>e.Test==='TestAcceptRetireBatch'&&e.Action==='fail');
  const where='TestAcceptRetireBatch: go '+args.join(' ')+'; exit '+r.status+'; '+(r.error||'')+'\n'+raw;
  if(!ran || (!passed&&!failed)) throw Error('absent, skipped or zero runs: '+where);
  if(r.status!==0 || !passed) throw Error(where);
 } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
if(require.main===module){
 try {run(process.argv[2]);console.log('retire observer accepted');}
 catch(e){if(process.argv[2]==='bad' && String(e).includes('retire exceeded two 5s grace periods')){console.log('retire observer rejected serial retirement');process.exitCode=1;}else{console.error(String(e));process.exitCode=2;}}
}else{
 const {When,Then}=require('@cucumber/cucumber');
 When('I retire three TERM-ignoring yielded shells',{timeout:95000},function(){this.retireError=null;try{run('candidate');}catch(e){this.retireError=e;}});
 Then('all three discarded handles and groups end within less than {int} seconds',function(seconds){if(seconds!==10)throw Error('fixture bound is 10 seconds');if(this.retireError)throw this.retireError;});
}
