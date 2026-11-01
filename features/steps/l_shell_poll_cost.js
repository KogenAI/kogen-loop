'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn,spawnSync} = require('node:child_process');
function verify(rows, expected) {
  assert.equal(rows.length, expected.length, 'command count');
  rows.forEach((r,i) => {
    assert.equal(r.requests, expected[i], 'requests per command');
    assert.equal(r.output, 'partial\ncomplete\n', 'cumulative output delivered to provider');
    assert.equal(r.exit_status, 7, 'exit status delivered to provider');
    assert.equal(r.first, 'exit status: 7\npartial\ncomplete\n', 'first result is the completed command text');
  });
}
async function run(seconds) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'poll-cost-'));
  let child, server, timer, failure;
  try {
    const bin=path.join(dir,'loop');
    const build=spawnSync('go',['build','-o',bin,'./cmd/kogen-loop'],{encoding:'utf8',timeout:60000});
    assert.equal(build.status,0,'go build ./cmd/kogen-loop: '+build.stdout+build.stderr);
    const root=path.join(dir,'root'),home=path.join(dir,'home'); fs.mkdirSync(root);
    const creds=path.join(home,'.kogen','credentials'); fs.mkdirSync(creds,{recursive:true});
    fs.writeFileSync(path.join(creds,'chatgpt.json'),JSON.stringify({client_id:'oaiapp_fixture',access_token:'fake',refresh_token:'fake',expires_at:Math.floor(Date.now()/1000)+3600}));
    let requests=0, last='start', first, final;
    server=http.createServer(async(req,res)=>{
      try {
        assert.equal(req.url,'/v1/responses');
        let raw=''; for await(const b of req) raw+=b;
        const body=JSON.parse(raw); requests++;
        assert.ok(requests<=45,'bounded fixture request count');
        let args;
        if(requests===1) args={command:`printf 'partial\\n'; sleep ${seconds}; printf 'complete\\n'; exit 7`};
        else {
          const output=body.input.find(x=>x.type==='function_call_output'&&x.call_id===last);
          assert.ok(output,'shell result reaches next model request');
          assert.equal(requests,2,'one result request after the command');
          first=output.output;
          const m=/^exit status: (\d+)\n([\s\S]*)$/.exec(first);
          assert.ok(m,'completed command text');
          final={exit_status:Number(m[1]),output:m[2]};
        }
        const items=final ? [{type:'message',role:'assistant',content:[{type:'output_text',text:'done'}]}] : [{type:'function_call',call_id:(last='call'+requests),name:'shell',arguments:JSON.stringify(args)}];
        res.writeHead(200,{'Content-Type':'text/event-stream'});
        items.forEach((item,i)=>res.write('data: '+JSON.stringify({type:'response.output_item.done',output_index:i,item})+'\n\n'));
        res.end('data: '+JSON.stringify({type:'response.completed',response:{status:'completed'}})+'\n\n');
      } catch(e) {failure=e; res.writeHead(400);res.end(); if(child)child.kill('SIGTERM');}
    });
    await new Promise(r=>server.listen(0,'127.0.0.1',r));
    const task={protocol:'kogen-loop/v1',root,role:{provider:'chatgpt',model:'fixture-model',effort:'medium',base_url:''},instructions:'',prompt:'fixture',tools:['shell'],protected:[],excluded:[],terminal:['finish'],deadline_seconds:45,session:{dir:'',resume:false},requires:[]};
    child=spawn(bin,['run','--task','-'],{cwd:root,env:{...process.env,HOME:home,KOGEN_PROVIDER_URL:'http://127.0.0.1:'+server.address().port}});
    let stderr=''; child.stderr.on('data',b=>stderr+=b);child.stdout.resume();
    const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
    child.stdin.end(JSON.stringify(task));
    timer=setTimeout(()=>child.kill('SIGTERM'),50000);
    const code=await done; if(failure)throw failure;
    assert.equal(code,0,'CLI completion: '+stderr); assert.ok(final,'completed result');
    return {requests,first,output:final.output,exit_status:final.exit_status};
  } finally {
    clearTimeout(timer);if(child&&child.exitCode===null)child.kill('SIGKILL');
    if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
if(require.main===module) {
  const good=[{requests:2,first:'exit status: 7\npartial\ncomplete\n',output:'partial\ncomplete\n',exit_status:7}];
  if(process.argv[2]==='good'){verify(good,[2]);console.log('poll observer accepted');}
  else {
    for(const [key,value] of Object.entries({requests:8,first:'{"status":"running"}',output:'partial\n',exit_status:0})) {
      assert.throws(()=>verify([{...good[0],[key]:value}],[2]),undefined,'reject '+key);
    }
    console.log('poll observer rejected');process.exitCode=1;
  }
} else {
  const {When,Then}=require('@cucumber/cucumber');
  When('I measure shell commands lasting {int} and {int} seconds',{timeout:180000},async function(a,b){this.pollRows=[await run(a),await run(b)];console.log('requests per long command: '+JSON.stringify(this.pollRows.map(r=>r.requests)));});
  Then('each command uses {int} model requests and delivers its complete result in the first tool response',function(n){verify(this.pollRows,[n,n]);});
}
