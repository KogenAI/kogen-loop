'use strict';
// Acceptance driver of L-TOOL-ERROR-CLASSES: it builds the real CLI, runs it against a local
// scripted Responses provider whose first answer is one batch of tool calls and whose second
// answer is finish, and observes the tool.call and tool.result events on stdout and the
// function_call_output texts the second request carries to the model.
// `node l_tool_error_classes.js --control good|bad` checks the observer on synthetic event
// streams built from EXPECTED.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

const SENTINEL = 'SENTINEL-1c9e';
const TOOLS = ['read_file', 'write_file', 'list_files', 'search_text', 'shell', 'view_image'];
// CALLS are the scripted model's first answer per fixture: [call_id, tool name, arguments].
const CALLS = {
  errors: [
    ['ok-read', 'read_file', {path:'a.txt'}],
    ['ok-list', 'list_files', {path:'dir'}],
    ['ok-search', 'search_text', {pattern:'zzz-no-such-text'}],
    ['ok-exit', 'shell', {command:'exit 3'}],
    ['not-found', 'read_file', {path:'missing-' + SENTINEL + '.txt'}],
    ['not-found-folder-text', 'read_file', {path:'gone is a folder; use list_files'}],
    ['folder', 'read_file', {path:'dir'}],
    ['outside', 'read_file', {path:'../outside.txt'}],
    ['home', 'list_files', {path:'~'}],
    ['escape', 'search_text', {pattern:'secret', path:'escape.txt'}],
    ['image-outside', 'view_image', {path:'escape.txt'}],
    ['protected', 'write_file', {path:'guard.txt', content:'changed ' + SENTINEL}],
    ['file-error', 'write_file', {path:'blocker/x.txt', content:'x'}],
    ['handle', 'shell', {handle:'no-such-handle-' + SENTINEL}],
    ['kill', 'shell', {command:'pkill -f nothing-at-all-' + SENTINEL}],
    ['image', 'view_image', {path:'a.txt'}],
  ],
  malformed: [
    ['unknown', 'delete_file', {path:SENTINEL}],
    ['disabled', 'documentation', {operation:'search', query:SENTINEL}],
    ['read-missing', 'read_file', {}],
    ['read-type', 'read_file', {path:7}],
    ['write-missing', 'write_file', {path:'new.txt'}],
    ['write-type', 'write_file', {path:'new.txt', content:null}],
    ['search-missing', 'search_text', {path:'dir'}],
    ['image-missing', 'view_image', {}],
    ['image-type', 'view_image', {path:['a.txt']}],
    ['shell-both', 'shell', {command:'echo ' + SENTINEL, handle:'h'}],
    ['shell-neither', 'shell', {}],
    ['shell-blank', 'shell', {command:'  '}],
    ['shell-type', 'shell', {command:['echo', SENTINEL]}],
    ['ok-shell', 'shell', {command:'echo fine'}],
  ],
  'not-git': [
    ['list', 'list_files', {}],
    ['search', 'search_text', {pattern:SENTINEL}],
    ['ok-read', 'read_file', {path:'a.txt'}],
  ],
};
const IMAGE = ': unreadable/nonregular artifact or invalid PNG: ';
const LIMITS = '. Limits: static non-interlaced RGB8 PNG, 1..131072 bytes, dimensions 1..2048. Prepare/export a supported image with an ordinary external image preparation/capture tool and select it again.';
const OUTSIDE = ': path is outside the repository root; reads are confined to the repository root';
const NOT_GIT = 'error: fatal: not a git repository (or any of the parent directories): .git';
const ends = call => ({...Object.fromEntries(CALLS[call].map(([id]) => [id, {}])), end:{}});
// EXPECTED repeats the feature's expectations for the observer controls (--control good|bad).
const EXPECTED = {
  errors: {exit:0, ending:'terminal', logged:[], callEvents:ends('errors'),
    results:{'ok-read':{}, 'ok-list':{}, 'ok-search':{}, 'ok-exit':{},
      'not-found':{error_kind:'not_found'}, 'not-found-folder-text':{error_kind:'not_found'}, folder:{error_kind:'is_folder'},
      outside:{error_kind:'outside_root'}, home:{error_kind:'outside_root'}, escape:{error_kind:'outside_root'}, 'image-outside':{error_kind:'outside_root'},
      protected:{error_kind:'protected'}, 'file-error':{error_kind:'file_error'}, handle:{error_kind:'unknown_shell_handle'},
      kill:{rule:'pkill-killall', error_kind:'foreign_kill'}, image:{error_kind:'invalid_image'}},
    outputs:{'ok-read':'1\talpha', 'ok-list':'dir/b.txt', 'ok-search':'(no matches)', 'ok-exit':'exit status: 3\n',
      'not-found':'error: missing-' + SENTINEL + '.txt does not exist', 'not-found-folder-text':'error: gone is a folder; use list_files does not exist',
      folder:'error: dir is a folder; use list_files', outside:'error: ../outside.txt' + OUTSIDE,
      home:'error: ~: home paths (~) are not allowed; reads are confined to the repository root',
      escape:'error: escape.txt' + OUTSIDE, 'image-outside':'error: escape.txt' + OUTSIDE,
      protected:'refused: guard.txt is part of the approved acceptance baseline', 'file-error':'error: blocker/x.txt: enotdir',
      handle:'error: unknown shell handle',
      kill:'refused: this command would stop processes this run did not start (rule: no pkill or killall; kill only pids this run created). Stop what you started with its own pid, for example kill $!, or its process group.',
      image:'error: a.txt' + IMAGE + 'invalid PNG signature' + LIMITS}},
  malformed: {exit:0, ending:'terminal', logged:[], callEvents:ends('malformed'),
    results:{unknown:{malformed_class:'unknown_tool'}, disabled:{malformed_class:'unknown_tool'},
      'read-missing':{malformed_class:'missing_argument'}, 'read-type':{malformed_class:'wrong_argument_type'},
      'write-missing':{malformed_class:'missing_argument'}, 'write-type':{malformed_class:'wrong_argument_type'},
      'search-missing':{malformed_class:'missing_argument'},
      'image-missing':{malformed_class:'missing_argument'}, 'image-type':{malformed_class:'wrong_argument_type'},
      'shell-both':{malformed_class:'conflicting_arguments'}, 'shell-neither':{malformed_class:'missing_argument'},
      'shell-blank':{malformed_class:'missing_argument'}, 'shell-type':{malformed_class:'wrong_argument_type'}, 'ok-shell':{}},
    outputs:{unknown:'error: unknown tool delete_file', disabled:'error: unknown tool documentation',
      'read-missing':'error: argument path must be a string', 'read-type':'error: argument path must be a string',
      'write-missing':'error: argument content must be a string', 'write-type':'error: argument content must be a string',
      'search-missing':'error: argument pattern must be a string',
      'image-missing':'error: (no selected path)' + IMAGE + 'path must be a string' + LIMITS,
      'image-type':'error: (no selected path)' + IMAGE + 'path must be a string' + LIMITS,
      'shell-both':'error: supply exactly one of command or handle', 'shell-neither':'error: supply exactly one of command or handle',
      'shell-blank':'error: supply exactly one of command or handle', 'shell-type':'error: argument command must be a string',
      'ok-shell':'exit status: 0\nfine\n'}},
  'not-git': {exit:0, ending:'terminal', logged:[], callEvents:ends('not-git'),
    results:{list:{error_kind:'git_failed'}, search:{error_kind:'git_failed'}, 'ok-read':{}},
    outputs:{list:NOT_GIT, search:NOT_GIT, 'ok-read':'1\talpha'}},
};
// observe requires the whole observation to equal the expectation: no field is ignored.
function observe(got, want) {
  assert.deepEqual(got, want, 'tool error classes observation ' + JSON.stringify(got));
}
const envelope = ['protocol', 'seq', 'time', 'type'];
// extras are an event's fields beyond the envelope and the given existing fields.
const extras = (e, base) => Object.fromEntries(Object.entries(e).filter(([k]) => ![...envelope, ...base].includes(k)));
// summarize turns the CLI's stdout, the outputs the model received and the exit code into an
// observation: the fields each tool.result and tool.call adds to its existing ones, by call_id,
// and which of the argument sentinel and the full tool error texts appear anywhere on stdout.
function summarize(stdout, outputs, exit) {
  const events = stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
  const error = events.find(e => e.type === 'error');
  assert.equal(error, undefined, 'CLI error event ' + JSON.stringify(error));
  const results = {}, callEvents = {};
  for (const e of events) {
    if (e.type === 'tool.result') results[e.call_id] = extras(e, ['call_id', 'name', 'result_sha256', 'bytes', 'cut']);
    if (e.type === 'tool.call') callEvents[e.call_id] = extras(e, ['call_id', 'name', 'arguments_sha256']);
  }
  const errorTexts = Object.values(outputs).filter(t => typeof t === 'string' && /^(error|refused): /.test(t));
  const logged = [SENTINEL, ...errorTexts].filter(t => stdout.includes(t) || stdout.includes(JSON.stringify(t).slice(1, -1)));
  const ended = events.find(e => e.type === 'round.ended');
  return {exit, ending:ended && ended.ending, logged, callEvents, results, outputs};
}
let built;
function binary() {
  if (!built) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-tool-error-classes-bin-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true, force:true}));
    const bin = path.join(dir, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', bin, './cmd/kogen-loop'], {encoding:'utf8', timeout:100000});
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr + (build.error || ''));
    built = bin;
  }
  return built;
}
// gitEnv is this process's environment without inherited Git variables, with a fixture HOME,
// no system or global Git configuration, a fixed author and no repository at or above dir.
const gitEnv = (home, dir) => ({...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))), HOME:home, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null', GIT_CEILING_DIRECTORIES:dir,
  GIT_AUTHOR_NAME:'fixture', GIT_AUTHOR_EMAIL:'fixture@example.invalid', GIT_COMMITTER_NAME:'fixture', GIT_COMMITTER_EMAIL:'fixture@example.invalid'});
function git(root, env, ...args) {
  const r = spawnSync('git', args, {cwd:root, env, encoding:'utf8'});
  assert.equal(r.status, 0, 'git ' + args.join(' ') + ': ' + r.stdout + r.stderr);
}
function put(root, name, content) {
  fs.mkdirSync(path.dirname(path.join(root, name)), {recursive:true});
  fs.writeFileSync(path.join(root, name), content);
}
// fixture writes the root: a.txt and ../outside.txt beside the root; except for not-git also
// dir/b.txt, guard.txt (protected), blocker (a file) and escape.txt (a symlink to
// ../outside.txt), committed to a new Git repository.
function fixture(mode, dir, root, env) {
  put(root, 'a.txt', 'alpha\n');
  fs.writeFileSync(path.join(dir, 'outside.txt'), 'secret\n');
  if (mode === 'not-git') return;
  put(root, 'dir/b.txt', 'beta\n');
  put(root, 'guard.txt', 'guarded\n');
  put(root, 'blocker', 'a file, not a folder\n');
  fs.symlinkSync('../outside.txt', path.join(root, 'escape.txt'));
  git(root, env, 'init', '-q', '.');
  git(root, env, 'add', '-A');
  git(root, env, 'commit', '-qm', 'fixture');
}
// run runs the built CLI once on a fixture against the scripted provider.
async function run(mode) {
  assert.ok(CALLS[mode], 'unknown tool error classes fixture ' + mode);
  const bin = binary();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'l-tool-error-classes-')));
  let server, child, timer, failure;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive:true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now() / 1000) + 3600}));
    const env = gitEnv(home, dir);
    fixture(mode, dir, root, env);
    const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''}, instructions:'', prompt:'fixture task', tools:TOOLS, protected:['guard.txt'], excluded:[], terminal:['finish'], deadline_seconds:0, session:{dir:'', resume:false}, requires:[]};
    const outputs = {};
    let requests = 0;
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/v1/responses');
        let raw = ''; for await (const chunk of req) raw += chunk;
        const body = JSON.parse(raw);
        const n = ++requests;
        assert.ok(n <= 2, 'tool error classes fixture request count');
        let items;
        if (n === 1) {
          items = CALLS[mode].map(([id, name, args]) => ({type:'function_call', call_id:id, name, arguments:JSON.stringify(args)}));
        } else {
          for (const x of body.input || []) if (x.type === 'function_call_output') outputs[x.call_id] = x.output;
          items = [{type:'function_call', call_id:'end', name:'finish', arguments:JSON.stringify({summary:'done'})}];
        }
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        for (let i = 0; i < items.length; i++) res.write('data: ' + JSON.stringify({type:'response.output_item.done', output_index:i, item:items[i]}) + '\n\n');
        res.end('data: ' + JSON.stringify({type:'response.completed', response:{status:'completed'}}) + '\n\n');
      } catch (e) { failure = failure || e; res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:e.message}})); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let stdout = '', stderr = '';
    child = spawn(bin, ['run', '--task', '-'], {cwd:root, env:{...env, KOGEN_PROVIDER_URL:'http://127.0.0.1:' + server.address().port}});
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
    child.stdin.end(JSON.stringify(task));
    let timedOut = false;
    timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 60000);
    const exit = await closed;
    if (failure) throw failure;
    assert.equal(timedOut, false, 'CLI did not finish within 60 s: ' + stderr);
    return summarize(stdout, outputs, exit);
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, {recursive:true, force:true});
  }
}
// stream is a synthetic CLI stdout that carries exactly what want expects.
function stream(want) {
  const lines = [{type:'session.started', session_id:'s'}];
  for (const id of Object.keys(want.callEvents)) {
    lines.push({type:'tool.call', call_id:id, name:'x', arguments_sha256:'0'.repeat(64), ...want.callEvents[id]});
    if (want.results[id]) lines.push({type:'tool.result', call_id:id, name:'x', result_sha256:'0'.repeat(64), bytes:1, cut:false, ...want.results[id]});
  }
  lines.push({type:'round.ended', ending:want.ending, claim:'{"summary":"done"}'}, {type:'session.ended', status:'ended', exit:want.exit});
  return lines.map((l, i) => JSON.stringify({protocol:'kogen-loop/v1', seq:i + 1, time:'2026-11-03T00:00:00Z', ...l})).join('\n') + '\n';
}
// edit is stdout with fn applied to its parsed lines.
const edit = (stdout, fn) => stdout.trim().split('\n').map(s => JSON.parse(s)).flatMap(e => fn(e) || [e]).map(e => JSON.stringify(e)).join('\n') + '\n';
// mutations are wrong CLI streams and exit codes, each of which the observer must reject.
function mutations(want) {
  const good = stream(want), out = [];
  for (const id of Object.keys(want.results)) {
    const has = want.results[id];
    for (const key of Object.keys(has)) out.push(['drop ' + key + ' of ' + id, edit(good, e => e.type === 'tool.result' && e.call_id === id ? [Object.fromEntries(Object.entries(e).filter(([k]) => k !== key))] : null)]);
    const extraKey = has.error_kind ? 'malformed_class' : 'error_kind';
    out.push(['add ' + extraKey + ' to ' + id, edit(good, e => e.type === 'tool.result' && e.call_id === id ? [{...e, [extraKey]:'other'}] : null)]);
    if (has.error_kind || has.malformed_class) {
      const key = has.error_kind ? 'error_kind' : 'malformed_class';
      out.push(['change ' + key + ' of ' + id, edit(good, e => e.type === 'tool.result' && e.call_id === id ? [{...e, [key]:e[key] + 'x'}] : null)]);
    }
    out.push(['drop tool.result of ' + id, edit(good, e => e.type === 'tool.result' && e.call_id === id ? [] : null)]);
  }
  const first = Object.keys(want.callEvents)[0];
  out.push(['add a field to tool.call ' + first, edit(good, e => e.type === 'tool.call' && e.call_id === first ? [{...e, error_kind:'not_found'}] : null)]);
  out.push(['log the argument sentinel', edit(good, e => e.type === 'round.ended' ? [{...e, claim:'{"summary":"' + SENTINEL + '"}'}] : null)]);
  const errorText = Object.values(want.outputs).find(t => /^(error|refused): /.test(t));
  out.push(['log a tool error text', edit(good, e => e.type === 'session.started' ? [{...e, note:errorText}] : null)]);
  out.push(['end without a terminal call', edit(good, e => e.type === 'round.ended' ? [{...e, ending:'no_call'}] : null)]);
  out.push(['emit an error event', good + JSON.stringify({protocol:'kogen-loop/v1', seq:99, time:'2026-11-03T00:00:00Z', type:'error', class:'loop', reason:'failed', detail:'x'}) + '\n']);
  return out;
}
if (require.main === module) {
  if (process.argv[2] === '--control' && process.argv[3] === 'good') {
    for (const want of Object.values(EXPECTED)) observe(summarize(stream(want), want.outputs, want.exit), want);
    console.log('tool error classes observer accepted');
  } else if (process.argv[2] === '--control' && process.argv[3] === 'bad') {
    for (const want of Object.values(EXPECTED)) {
      for (const [label, stdout] of mutations(want)) {
        assert.throws(() => observe(summarize(stdout, want.outputs, want.exit), want), undefined, 'must reject: ' + label);
      }
      for (const id of Object.keys(want.outputs)) {
        assert.throws(() => observe(summarize(stream(want), {...want.outputs, [id]:want.outputs[id] + 'x'}, want.exit), want), undefined, 'must reject a changed output of ' + id);
      }
      assert.throws(() => observe(summarize(stream(want), want.outputs, 1), want), undefined, 'must reject exit 1');
    }
    console.log('tool error classes observer rejected'); process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('I run the tool error classes CLI fixture {string}', {timeout:110000}, async function(mode) { this.toolErrorClasses = await run(mode); });
  Then('the tool error classes observations are:', function(text) { observe(this.toolErrorClasses, JSON.parse(text)); });
}
