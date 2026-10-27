'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {createHash} = require('node:crypto');
const sha = s => createHash('sha256').update(s).digest('hex');
const clone = v => JSON.parse(JSON.stringify(v));
const object = (v, label) => { assert.ok(v !== null && typeof v === 'object' && !Array.isArray(v), label + ': object required'); return v; };
const first = 'provider/invalid_response: malformed Anthropic completion';
const frame = e => 'event: ' + e.type + '\ndata: ' + JSON.stringify(e) + '\n\n';
const ev = (type, rest = {}) => ({type, ...rest});
const start = () => frame(ev('message_start', {message:{id:'msg_fixture', model:'claude-opus-5-5', usage:{input_tokens:10}}}));
const block = (index, content_block) => frame(ev('content_block_start', {index, content_block})) + frame(ev('content_block_stop', {index}));
const stop = stop_reason => frame(ev('message_delta', {delta:{stop_reason}, usage:{output_tokens:12}})) + frame(ev('message_stop'));
const tool = () => ({type:'tool_use', id:'a', name:'write_file', input:{path:'escaped.txt', content:'SHOULD_NOT_EXIST'}});
const text = () => block(0, {type:'text', text:'done'});
function recipe(name, facade) {
  const p = start(), privateText = block(0, {type:'text', text:'AD_SECRET_TEXT_71'});
  const s = {Name:name, Facade:facade, Stream:''};
  if (name.startsWith('err_') || ['overloaded','api','error_alone','unknown_error','typed_error','missing_error'].includes(name)) {
    let type = name === 'api' ? 'api_error' : 'overloaded_error';
    if (name.startsWith('err_')) type = name.slice(4);
    if (name === 'unknown_error') type = 'AD_SECRET_ERROR_TYPE_72';
    if (name === 'typed_error') type = {AD_SECRET_ERROR_TYPE_72:true};
    const e = ev('error', {error:{type, message:'AD_SECRET_MESSAGE_73 SYNTHETIC_API_KEY_0001'}});
    if (name === 'missing_error') delete e.error;
    s.Stream = (name === 'error_alone' ? '' : p + privateText) + frame(e); return s;
  }
  if (name.startsWith('other_')) {
    s.Provider = name.slice(6).replace('_single',''); s.Single = name.endsWith('_single');
    s.Stream = ['opencode-go','openai-compatible'].includes(s.Provider) ? JSON.stringify({choices:[{message:{role:'assistant', content:'done'}, finish_reason:'stop'}], usage:{prompt_tokens:10, completion_tokens:12}}) : 'data: {broken\n\n'; return s;
  }
  if (['http429529','http5xx','http400','http401'].includes(name)) {
    s.Statuses = {http429529:[429,529,200], http5xx:[500,503,200], http400:[400], http401:[401]}[name]; s.Stream = p + text() + stop('end_turn'); return s;
  }
  switch (name) {
    case 'text': s.Stream = p + text() + stop('end_turn'); break;
    case 'tool': case 'end_tool': s.Stream = p + block(0, {type:'tool_use', id:'a', name:'finish', input:{summary:'done'}}) + stop(name === 'tool' ? 'tool_use' : 'end_turn'); break;
    case 'blank': case 'blank_tool': s.Stream = p + stop(name === 'blank' ? 'end_turn' : 'tool_use'); break;
    case 'whitespace': s.Stream = p + block(0, {type:'text', text:' \t\n'}) + stop('end_turn'); break;
    case 'max_tokens': case 'refusal': case 'pause_turn': case 'stop_sequence': s.Stream = p + privateText + stop(name); break;
    case 'unknown_stop': case 'typed_stop': s.Stream = p + privateText + stop(name === 'unknown_stop' ? 'AD_SECRET_STOP_74' : {AD_SECRET_STOP_74:true}); break;
    case 'changed_stop': s.Stream = p + text() + frame(ev('message_delta', {delta:{stop_reason:'max_tokens'}})) + stop('tool_use'); break;
    case 'delta': case 'unknown_delta': case 'typed_delta': case 'wrong_delta': {
      const type = {delta:'citations_delta', unknown_delta:'AD_SECRET_DELTA_75', typed_delta:['AD_SECRET_DELTA_75'], wrong_delta:'signature_delta'}[name];
      s.Stream = p + frame(ev('content_block_start', {index:0, content_block:{type:'text', text:'AD_SECRET_TEXT_71'}})) + frame(ev('content_block_delta', {index:0, delta:{type, text:'AD_SECRET_TEXT_71'}})) + frame(ev('content_block_stop', {index:0})) + stop('end_turn'); break;
    }
    case 'block': case 'unknown_block': case 'typed_block': {
      const type = {block:'server_tool_use', unknown_block:'AD_SECRET_BLOCK_76', typed_block:{AD_SECRET_BLOCK_76:1}}[name];
      s.Stream = p + block(0, {type, name:'AD_SECRET_NAME_77', input:{secret:'AD_SECRET_INPUT_78'}}) + stop('end_turn'); break;
    }
    case 'index': s.Stream = p + block(2, tool()) + stop('tool_use'); break;
    case 'order': s.Stream = text() + stop('end_turn'); break;
    case 'shape': s.Stream = p + frame(ev('content_block_start', {index:0, content_block:false})) + stop('end_turn'); break;
    case 'after_stop': s.Stream = p + text() + stop('end_turn') + frame(ev('content_block_start', {index:1, content_block:tool()})); break;
    case 'frame_json': case 'frame_shape': s.Stream = p + 'data: ' + (name === 'frame_json' ? '{broken AD_SECRET_JSON_79' : '[]') + '\n\n' + stop('end_turn'); break;
    case 'tool_json': s.Stream = p + frame(ev('content_block_start', {index:0, content_block:tool()})) + frame(ev('content_block_delta', {index:0, delta:{type:'input_json_delta', partial_json:'{AD_SECRET_INPUT_78'}})) + frame(ev('content_block_stop', {index:0})) + stop('tool_use'); break;
    case 'usage': s.Stream = frame(ev('message_start', {message:{usage:'AD_SECRET_USAGE_80'}})) + text() + stop('end_turn'); break;
    case 'duplicate': s.Stream = p + block(0, tool()) + block(1, tool()) + stop('tool_use'); break;
    case 'tool_id': case 'tool_name': case 'tool_input': case 'signature': {
      let b = tool(); if (name === 'tool_id') b.id = 'AD_SECRET_ID_81\n'; if (name === 'tool_name') b.name = 'AD_SECRET_NAME_77\n'; if (name === 'tool_input') b.input = ['AD_SECRET_INPUT_78'];
      if (name === 'signature') b = {type:'thinking', thinking:'AD_SECRET_THINKING_82', signature:''};
      s.Stream = p + block(0, tool()) + block(1, b) + stop('end_turn'); break;
    }
    case 'privacy': s.Stream = p + privateText + block(1, {type:'thinking', thinking:'AD_SECRET_THINKING_82', signature:'AD_SECRET_SIGNATURE_83'}) + block(2, {type:'tool_use', id:'AD_SECRET_ID_81', name:'AD_SECRET_NAME_77', input:{s:'AD_SECRET_INPUT_78'}}) + block(3, {type:'server_tool_use'}) + stop('end_turn'); break;
    case 'cut': case 'cut_exhaust': case 'cut_json': s.Cut = true; s.Exhaust = name === 'cut_exhaust'; s.Stream = p + (name === 'cut_json' ? 'data: {broken\n\n' : text()); break;
    case 'context': s.Stream = p + stop('model_context_window_exceeded'); break;
    case 'interrupt': s.Interrupt = true; break;
    default: assert.fail('unknown fixture ' + name);
  }
  return s;
}
let workspace;
const cache = new Map();
function world() {
  if (!workspace) {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'anthropic-invalid-')); fs.chmodSync(workspace, 0o700);
    for (const d of ['home','tmp','cache','gopath']) fs.mkdirSync(path.join(workspace, d), {mode:0o700});
    fs.writeFileSync(path.join(workspace, 'overlay.json'), JSON.stringify({Replace:{[path.resolve('conformance/anthropic_invalid_diagnostics_acceptance_test.go')]:path.resolve('features/steps/anthropic_invalid_diagnostics_test.go.txt')}}), {mode:0o600});
  }
  return workspace;
}
function execute(specs, mask, replay = false) {
  assert.ok(['077','022'].includes(mask)); const d = world();
  const names = replay ? ['TestADReplay'] : ['TestADCollector'];
  const r = spawnSync('/bin/sh', ['-c','umask "$1"; shift; exec go "$@"','ad',mask,'test','-json','-count=1','-timeout=90s','-overlay',path.join(d,'overlay.json'),'./conformance','-run','^(' + names.join('|') + ')$'], {
    env:{PATH:process.env.PATH, LC_ALL:'C', HOME:path.join(d,'home'), TMPDIR:path.join(d,'tmp'), GOCACHE:path.join(d,'cache'), GOPATH:path.join(d,'gopath'), GOENV:'off', GOTOOLCHAIN:'local', GOPROXY:'off', GOSUMDB:'off', AD_SPECS:JSON.stringify(specs)}, encoding:'utf8', maxBuffer:64*1024*1024
  });
  return {status:r.status, signal:r.signal, error:r.error ? r.error.message : null, stdout:r.stdout || '', stderr:r.stderr || '', names};
}
function report(r) {
  object(r,'report'); assert.equal(typeof r.stdout,'string','report.stdout'); assert.ok(Array.isArray(r.names),'report.names'); assert.equal(r.error,null,'process.error'); assert.equal(r.signal,null,'process.signal'); assert.equal(r.status,0,'process.status\n'+r.stdout+r.stderr); assert.equal(r.stderr,'','process.stderr');
  const events = r.stdout.trim().split('\n').map(s=>object(JSON.parse(s),'report.frame')); assert.ok(events.length,'report.empty');
  assert.ok(events.every(e => e.Package === 'kogen-loop/conformance'),'report.package'); assert.ok(!events.some(e => ['skip','fail'].includes(e.Action)),'report.fail-or-skip');
  const count = (action,test) => events.filter(e => e.Action === action && e.Test === test).length;
  assert.equal(count('start',undefined),1,'report.start'); assert.equal(count('pass',undefined),1,'report.pass');
  for (const n of r.names) { assert.equal(count('run',n),1,'report.run.'+n); assert.equal(count('pass',n),1,'report.pass.'+n); }
  for (const e of events.filter(e => e.Action === 'run')) { assert.equal(count('run',e.Test),1,'report.duplicate'); assert.equal(count('pass',e.Test),1,'report.unfinished'); }
  return events;
}
function observations(r, specs) {
  const events = report(r), rows = [];
  for (const spec of specs) {
    const test = 'TestADCollector/' + spec.Name + '_' + spec.Facade;
    const lines = events.filter(e => e.Test === test && e.Action === 'output').map(e => e.Output).join('').split('\n').filter(s => s.startsWith('ADOBS '));
    assert.equal(lines.length,1,'payload.count.'+test); const row = object(JSON.parse(lines[0].slice(6)),'payload');
    assert.equal(row.Name,spec.Name,'payload.name'); assert.equal(row.Facade,spec.Facade,'payload.facade'); rows.push(row);
  }
  assert.equal(events.filter(e => e.Action === 'run' && e.Test?.startsWith('TestADCollector/')).length,specs.length,'payload.extra-test'); return rows;
}
function collect(cases, mask) {
  const specs = cases.flatMap(c => c.facades.map(f => recipe(c.name,f))); const key = mask + JSON.stringify(specs);
  if (!cache.has(key)) cache.set(key,observations(execute(specs,mask),specs)); return cache.get(key);
}
function privacy(row) {
  object(row,'privacy.row'); const {Wire, ...publicBytes} = row;
  assert.ok(!/AD_SECRET_|SYNTHETIC_API_KEY_0001|synthetic-access|synthetic-refresh/.test(JSON.stringify(publicBytes)),'privacy.public-bytes');
}
function invalidBase(row) {
  object(row,'invalid'); assert.ok(Array.isArray(row.Records) && row.Records.length === 1,'invalid.one-record');
  assert.ok(Array.isArray(row.Wire),'invalid.wire-array'); for(const w of row.Wire) {object(w,'invalid.wire');object(w.Header,'invalid.headers');assert.equal(typeof w.Body,'string','invalid.body');}
  assert.ok(Array.isArray(row.Events),'invalid.events-array'); for(const e of row.Events) object(e,'invalid.event');
  if(['CLI','Session'].includes(row.Facade)) assert.deepEqual(row.Events.filter(e=>e.type==='request.attempt').map(e=>object(e.record,'invalid.event-record')),row.Records,'invalid.events-records');
  const rec = object(row.Records[0],'invalid.record');
  assert.equal(rec.provider,'anthropic','invalid.provider'); assert.equal(rec.outcome,'failed','invalid.outcome'); assert.equal(rec.error,'provider_failure','invalid.error');
  assert.equal(rec.usage_state,'unknown','invalid.usage-state'); assert.equal(rec.ttft_ms,null,'invalid.ttft'); assert.equal(rec.anthropic_stop_reason,null,'invalid.stop'); assert.equal(rec.anthropic_end_turn_tool_use,false,'invalid.marker');
  assert.deepEqual(rec.usage,{cached:null,input:null,output:null,reasoning:null,write:null,write_12h:null,write_30m:null},'invalid.usage');
  assert.equal(row.Response,null,'invalid.response'); assert.equal(row.Wire.length,1,'invalid.one-request'); assert.deepEqual(row.Sleeps,[],'invalid.sleeps'); assert.equal(row.Hooks,0,'invalid.hooks'); assert.deepEqual(row.Files,[],'invalid.files'); assert.equal(row.Stderr,'','invalid.stderr');
  if (row.Facade === 'CLI') {
    assert.equal(row.Exit,1,'invalid.cli-exit'); const e = row.Events.filter(e => e.type === 'error'); assert.equal(e.length,1,'invalid.cli-error');
    assert.deepEqual([e[0].class,e[0].reason,e[0].detail],['provider','invalid_response','malformed Anthropic completion'],'invalid.cli-fields');
    assert.deepEqual(row.Events.map(e => e.type),['session.started','request.started','request.attempt','error','session.ended'],'invalid.cli-events');
  } else {
    const e = object(row.Error,'invalid.typed-error'); assert.deepEqual([e.Class,e.Reason,e.Detail,e.Exit],['provider','invalid_response','malformed Anthropic completion',4],'invalid.typed-fields');
    assert.equal(row.First,first,'invalid.first-line'); assert.equal(row.Delivery,'unknown','invalid.delivery-consumer'); assert.equal(row.Exit,4,'invalid.exit');
    assert.equal(typeof row.Rendered,'string','invalid.rendered-type');
    assert.ok(!row.Rendered.includes('selection ') && !row.Rendered.includes(' was sent to '),'invalid.refusal-consumers');
  }
}
function diagnostic(row, want) {
  invalidBase(row);
  const rec = object(row.Records[0],'diagnostic.record'); assert.deepEqual(object(rec.provider_failure,'diagnostic.absent-or-ill-typed'),want,'diagnostic.value');
  if (row.Facade !== 'CLI') {
    assert.deepEqual(object(row.Error.ProviderFailure,'diagnostic.typed-evidence'),want,'diagnostic.typed-value');
    assert.ok(Array.isArray(row.Error.Lines) && row.Error.Lines.length === 1,'diagnostic.one-detail-line');
    const line = row.Error.Lines[0]; assert.equal(typeof line,'string','diagnostic.line-type'); assert.ok(line.startsWith('provider failure: '),'diagnostic.line-prefix');
    assert.deepEqual(JSON.parse(line.slice(18)),want,'diagnostic.rendered-value'); assert.equal(row.Rendered,first+'\n  '+line+'\n','diagnostic.render');
  }
  privacy(row);
}
function stable(v) {
  if (Array.isArray(v)) return v.map(stable);
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => {
    let x = v[k];
    if (['operation_id','attempt_id','conversation_id','session_id','OperationID'].includes(k)) { assert.equal(typeof x,'string','parity.id.'+k); x = '<id>'; }
    if (['timestamp','time'].includes(k)) { assert.equal(typeof x,'string','parity.time'); assert.ok(!Number.isNaN(Date.parse(x)),'parity.time-format'); x = '<time>'; }
    if (k === 'wall_ms') { assert.ok(Number.isInteger(x) && x >= 0,'parity.wall'); x = '<wall>'; }
    return [k,stable(x)];
  }));
  return v;
}
function legacy(row, invalid) {
  const c = clone(row); delete c.Name;
  if (invalid) {
    for (const r of c.Records) delete r.provider_failure;
    for (const e of c.Events) if (e.type === 'request.attempt') delete object(e.record,'parity.event-record').provider_failure;
    if (c.Error !== null) {c.Error.ProviderFailure = null; c.Error.Lines = null; c.Rendered = first+'\n';}
  }
  return sha(JSON.stringify(stable(c)));
}
function checkRows(rows,cases,mode) {
  assert.ok(Array.isArray(rows),'observations.array'); for(const r of rows) object(r,'observations.row');
  const failures = [];
  for (const c of cases) for (const f of c.facades) {
    try {
      const selected = rows.filter(r => r.Name === c.name && r.Facade === f); assert.equal(selected.length,1,'observation.count'); const row = selected[0];
      if (mode === 'diagnostic') diagnostic(row,c.diagnostic);
      else { privacy(row); if (c.diagnostic) invalidBase(row); assert.equal(legacy(row,!!c.diagnostic),c.legacy[f],'baseline.parity.'+c.name+'.'+f); }
    } catch (e) { assert.ok(e instanceof assert.AssertionError || e instanceof SyntaxError,'checker must fail cleanly: '+e.stack); failures.push(c.name+'/'+f+': '+e.message); }
  }
  assert.equal(failures.length,0,failures.join('\n'));
}
function preservationDigest(root = '.') {
  const skip = p => p === '.git' || p === '.kogen/local' || p === 'bin' || p === 'kogen-loop' || p.endsWith('.DS_Store') ||
    p.startsWith('.kogen/intents/anthropic-invalid-diagnostics') || p.startsWith('features/steps/anthropic_invalid_diagnostics') ||
    /^provider\/[^/]+\.go$/.test(p) && !p.endsWith('_test.go') || p === 'docs/contract/loop-v1.md' ||
    /^(provider|conformance)\/anthropic_invalid_diagnostics[^/]*_test\.go$/.test(p) || p.startsWith('conformance/anthropic-invalid-diagnostics-testdata/');
  const rows = [];
  function walk(dir) {
    for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})) {
      const p = path.posix.join(dir,e.name); if(skip(p)) continue;
      if(e.isDirectory()) walk(p); else {assert.ok(e.isFile(),'scope.nonregular.'+p);rows.push([p,sha(fs.readFileSync(path.join(root,p)))]);}
    }
  }
  walk(''); rows.sort((a,b)=>a[0].localeCompare(b[0],'en')); return sha(JSON.stringify(rows));
}
function cleanup() { if (workspace) fs.rmSync(workspace,{recursive:true,force:true}); workspace = undefined; cache.clear(); }
function control(kind) {
  // Controls reach diagnostics and legacy/privacy assertions without requiring product green.
  const want = {anthropic_invalid:'sse_error',error_type:'overloaded_error'};
  const rec = {provider:'anthropic',outcome:'failed',error:'provider_failure',usage_state:'unknown',ttft_ms:null,anthropic_stop_reason:null,anthropic_end_turn_tool_use:false,usage:{cached:null,input:null,output:null,reasoning:null,write:null,write_12h:null,write_30m:null},provider_failure:want};
  const line = 'provider failure: '+JSON.stringify(want);
  const row = {Name:'fixture',Facade:'Provider',Records:[rec],Error:{Class:'provider',Reason:'invalid_response',Detail:'malformed Anthropic completion',Exit:4,ProviderFailure:want,Lines:[line]},Rendered:first+'\n  '+line+'\n',First:first,Delivery:'unknown',Events:[],Stderr:'',Exit:4,Response:null,Wire:[{Body:'wire',Header:{}}],Sleeps:[],Hooks:0,Files:[]};
  const spec = {name:'fixture',facades:['Provider'],diagnostic:want,legacy:{Provider:legacy(row,true)}};
  const event = (Action,Test,Output) => ({Package:'kogen-loop/conformance',Action,...(Test ? {Test}:{}),...(Output ? {Output}:{})});
  const name = 'TestADCollector/fixture_Provider', long = clone(row); long.Wire[0].Body = 'x'.repeat(1600);
  const bytes = 'ADOBS '+JSON.stringify(long)+'\n';
  const frames = [event('start'),event('run','TestADCollector'),event('run',name),event('output',name,bytes.slice(0,1024)),event('output',name,bytes.slice(1024)),event('pass',name),event('pass','TestADCollector'),event('pass')];
  const reportOf = e => ({status:0,signal:null,error:null,stderr:'',stdout:e.map(x=>JSON.stringify(x)).join('\n')+'\n',names:['TestADCollector']});
  if (kind === 'good') {
    const realCases = [{name:'overloaded',facades:['Provider','Direct','Session','CLI'],diagnostic:want}];
    for(const actual of collect(realCases,'077')) {
      invalidBase(actual); privacy(actual); const enriched=clone(actual);
      enriched.Records[0].provider_failure=clone(want);
      for(const e of enriched.Events) if(e.type==='request.attempt') e.record.provider_failure=clone(want);
      if(enriched.Facade!=='CLI') {enriched.Error.ProviderFailure=clone(want);enriched.Error.Lines=[line];enriched.Rendered=first+'\n  '+line+'\n';}
      diagnostic(enriched,want);
    }
    const d=path.join(world(),'scope-control');fs.mkdirSync(d,{mode:0o700});fs.writeFileSync(path.join(d,'kept'),'old');const old=preservationDigest(d);fs.writeFileSync(path.join(d,'kept'),'new');assert.notEqual(preservationDigest(d),old,'scope.control');
    diagnostic(row,want); checkRows([row],[spec],'legacy'); assert.deepEqual(observations(reportOf(frames),[{Name:'fixture',Facade:'Provider'}]),[long]);
    for (const facade of ['Direct','Session']) diagnostic({...row,Facade:facade,Events:facade==='Session'?[{type:'request.attempt',record:clone(rec)}]:[]},want);
    process.stdout.write('anthropic-invalid observer good\n'); return;
  }
  assert.equal(kind,'bad');
  const reject = fn => {let e;try {fn();} catch(err){e=err;}assert.ok(e instanceof assert.AssertionError || e instanceof SyntaxError,'negative must assert, never panic/TypeError');};
  const mutations = [r=>r.Records=[],r=>r.Records=null,r=>delete r.Wire,r=>r.Wire=[null],r=>r.Events=null,r=>r.Events=[null],r=>r.Records[0]=null,r=>delete r.Records[0].provider_failure,r=>r.Records[0].provider_failure='wrong',r=>r.Records[0].provider_failure.error_type='api_error',r=>r.Error=null,r=>r.Error.ProviderFailure=null,r=>r.Error.Lines=[],r=>r.Error.Lines=[null],r=>r.Rendered=null,r=>r.Rendered+='leak',r=>r.Delivery='failed',r=>r.Hooks=1,r=>r.Files=['escaped.txt'],r=>r.Sleeps=[2],r=>r.Response={},r=>r.Records[0].usage.input=10,r=>r.Records[0].ttft_ms=0,r=>r.Records[0].anthropic_stop_reason='end_turn',r=>r.Records[0].anthropic_end_turn_tool_use=true,r=>r.Records[0].extra='AD_SECRET_MESSAGE_73'];
  for (const mutate of mutations) {const bad=clone(row);mutate(bad);reject(()=>diagnostic(bad,want));}
  for (const mutate of [r=>r.Wire[0].Body+='!',r=>r.Wire[0].Header={Extra:['value']},r=>r.Records[0].extra=true,r=>r.Events=[{type:'extra'}]]) {const bad=clone(row);mutate(bad);reject(()=>checkRows([bad],[spec],'legacy'));}
  reject(()=>checkRows(null,[spec],'diagnostic')); reject(()=>checkRows([null],[spec],'diagnostic'));
  reject(()=>checkRows([],[spec],'diagnostic')); reject(()=>observations(reportOf(frames.filter((_,i)=>i!==4)),[{Name:'fixture',Facade:'Provider'}]));
  for (const i of [0,1,2,5,6,7]) reject(()=>observations(reportOf(frames.filter((_,n)=>n!==i)),[{Name:'fixture',Facade:'Provider'}]));
  for (const k of ['status','stderr','signal','error','stdout','names']) {const r=reportOf(frames);r[k]=k==='status'?1:k==='stdout'?null:'bad';reject(()=>report(r));}
  process.stdout.write('anthropic-invalid observer bad rejected\n'); process.exitCode=1;
}
if (require.main === module) {
  try {
    if (process.argv[2] === '--control') control(process.argv[3]);
    else {
      assert.equal(process.argv[2],'--baseline'); const cases = JSON.parse(fs.readFileSync(process.argv[3],'utf8')); const rows = collect(cases,'077');
      for (const c of cases) { const legacyValues = {}; for (const r of rows.filter(r=>r.Name===c.name)) { if (c.diagnostic) invalidBase(r); privacy(r); legacyValues[r.Facade] = legacy(r,!!c.diagnostic); } console.log(JSON.stringify({name:c.name,legacy:legacyValues})); }
    }
  } catch(e) {console.error(e.stack);process.exitCode=2;} finally {cleanup();}
} else {
  const {Given,When,Then,AfterAll} = require('@cucumber/cucumber');
  Given('the invalid Anthropic matrix is:',function(text){this.adMatrix=JSON.parse(text);for(const c of this.adMatrix.invalid)c.legacy=this.adMatrix.invalid_legacy;});
  When('I collect the {string} Anthropic matrix under umask {string}',{timeout:180000},function(kind,mask){assert.ok(['invalid','controls'].includes(kind));this.adCases=this.adMatrix[kind];this.adRows=collect(this.adCases,mask);});
  Then('the invalid Anthropic diagnostics match the matrix',function(){checkRows(this.adRows,this.adCases,'diagnostic');});
  Then('the invalid Anthropic legacy observations match the matrix',function(){checkRows(this.adRows,this.adCases,'legacy');});
  When('I exercise the existing complete Anthropic replay controls under umask {string}',{timeout:180000},function(mask){this.adReplay=execute([],mask,true);});
  Then('the complete Anthropic replay controls all pass',function(){const e=report(this.adReplay);assert.equal(e.filter(x=>x.Action==='run'&&x.Test?.startsWith('TestADReplay/')).length,9,'replay.nine-cases');});
  Then('the Anthropic preservation digest is {string}',function(want){assert.equal(preservationDigest(),want,'preservation.digest');});
  Then('the caller contract documents these optional diagnostics:',function(text){const doc=fs.readFileSync('docs/contract/loop-v1.md','utf8');for(const word of JSON.parse(text))assert.ok(doc.includes(word),'contract.note.'+word);});
  AfterAll(cleanup);
}
