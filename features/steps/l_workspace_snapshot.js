'use strict';
// Acceptance driver of L-WORKSPACE-SNAPSHOT: it builds the real CLI, runs it against a local
// scripted Responses provider on generated repositories and observes the opening request.
// `node l_workspace_snapshot.js --control good|bad` checks the observer against EXPECTED.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

const HEADER = 'Workspace at the start of the task: the output of list_files, then read_file of every listed file of up to 4096 bytes (larger or binary files are listed only). Files you change later are not updated here.';
const TASK = 'fixture task';
const SMALL = HEADER + '\n\nlist_files:\n"caf\\303\\251 notes.md"\nempty.txt\nnotes/todo.txt\n.gitignore\nMakefile\nREADME.md\nsrc/main.go' +
  '\n\nread_file "café notes.md":\n1\tnote' +
  '\n\nread_file "empty.txt":\n' +
  '\n\nread_file "notes/todo.txt":\n1\ttodo' +
  '\n\nread_file ".gitignore":\n1\tbuild/' +
  '\n\nread_file "Makefile":\n1\ttest:\n2\t\tgo test ./...' +
  '\n\nread_file "README.md":\n1\t# Demo\n2\t\n3\tRun make.' +
  '\n\nread_file "src/main.go":\n1\tpackage main\n2\t\n3\tfunc main() {}';
const NONE = {requests:1, inputItems:1, userTexts:[TASK], exit:0};
const SNAP = {inputItems:2, userTexts:[TASK, 'SNAPSHOT'], secondUserTexts:[TASK, 'SNAPSHOT'], listingMatchesListFiles:true, sectionsMatchReadFile:true, exit:0};
const range = (n, f) => Array.from({length:n}, (_, i) => f(i));
const SMALL_SHOWN = ['café notes.md', 'empty.txt', 'notes/todo.txt', '.gitignore', 'Makefile', 'README.md', 'src/main.go'];
// EXPECTED repeats the feature's expectations for the observer controls (--control good|bad).
const EXPECTED = {
  small: {requests:2, ...SNAP, snapshot:SMALL},
  kinds: {requests:2, ...SNAP,
    listing:['binary.dat', '"caf\\303\\251 notes.md"', 'exact.txt', 'gone.txt', 'latin1.txt', 'lines.txt', 'link.txt', 'outside.txt', 'over.txt', 'pipe', 'small.txt'],
    shown:['café notes.md', 'exact.txt', 'lines.txt', 'link.txt', 'small.txt']},
  paths: {
    '64': {requests:2, ...SNAP, listed:64, shown:range(64, i => 'f' + String(i).padStart(2, '0') + '.txt')},
    '65': NONE,
  },
  bytes: {
    '32768': {requests:2, ...SNAP, listing:['big.txt', ...range(8, i => 'k' + i + '.txt')], shown:range(8, i => 'k' + i + '.txt')},
    '32769': NONE,
  },
  roots: {
    repository: {requests:2, ...SNAP, listing:['a.txt'], shown:['a.txt']},
    'not-git': NONE,
    'empty-repo': NONE,
  },
  tools: {
    'list_files and read_file': {requests:2, ...SNAP, shown:SMALL_SHOWN},
    'read_file and shell': NONE,
    'list_files and shell': NONE,
  },
  resume: {openingUserTexts:[TASK, 'SNAPSHOT'], resumedUserTexts:[TASK, 'SNAPSHOT', 'more feedback'], resumedRequests:1, exit:0},
};
// MODES are the fixture runs each scenario combines: a fixture name and the enabled tools.
const ALL = ['read_file', 'write_file', 'list_files', 'search_text', 'shell'];
const MODES = {
  paths: {'64': ['paths-64', ALL], '65': ['paths-65', ALL]},
  bytes: {'32768': ['bytes-32768', ALL], '32769': ['bytes-32769', ALL]},
  roots: {repository: ['one-file', ALL], 'not-git': ['not-git', ALL], 'empty-repo': ['empty-repo', ALL]},
  tools: {'list_files and read_file': ['small', ALL], 'read_file and shell': ['small', ['read_file', 'shell']], 'list_files and shell': ['small', ['list_files', 'shell']]},
};
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v);
// observe compares every expected key (nested objects key by key) with the observation.
function observe(got, want, where = 'workspace snapshot observation') {
  for (const [key, value] of Object.entries(want)) {
    const at = where + ' ' + key;
    if (plain(value)) { assert.ok(got && plain(got[key]), at + ' missing in ' + JSON.stringify(got)); observe(got[key], value, at); }
    else assert.deepEqual(got && got[key], value, at + ' in ' + JSON.stringify(got));
  }
}
function leaves(obj, prefix = []) {
  return Object.entries(obj).flatMap(([k, v]) => plain(v) ? leaves(v, [...prefix, k]) : [[...prefix, k]]);
}
function edit(obj, keys, fn) {
  const copy = structuredClone(obj); let at = copy;
  for (const k of keys.slice(0, -1)) at = at[k];
  fn(at, keys[keys.length - 1]); return copy;
}
let built;
function binary() {
  if (!built) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-workspace-snapshot-bin-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true, force:true}));
    const bin = path.join(dir, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', bin, './cmd/kogen-loop'], {encoding:'utf8', timeout:100000});
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr + (build.error || ''));
    built = bin;
  }
  return built;
}
// gitEnv is this process's environment without inherited Git variables, with a fixture HOME,
// no system or global Git configuration and a fixed author.
const gitEnv = home => ({...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))), HOME:home, GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null',
  GIT_AUTHOR_NAME:'fixture', GIT_AUTHOR_EMAIL:'fixture@example.invalid', GIT_COMMITTER_NAME:'fixture', GIT_COMMITTER_EMAIL:'fixture@example.invalid'});
function git(root, home, ...args) {
  const r = spawnSync('git', args, {cwd:root, env:gitEnv(home), encoding:'utf8'});
  assert.equal(r.status, 0, 'git ' + args.join(' ') + ': ' + r.stdout + r.stderr);
}
function put(root, name, content) {
  fs.mkdirSync(path.dirname(path.join(root, name)), {recursive:true});
  fs.writeFileSync(path.join(root, name), content);
}
// fixture writes the repository of a mode into root (and its parent dir for an outside target).
function fixture(mode, root, home) {
  if (mode === 'not-git') { put(root, 'a.txt', 'a\n'); return; }
  git(root, home, 'init', '-q', '.');
  switch (mode) {
    case 'small':
      put(root, 'README.md', '# Demo\n\nRun make.\n');
      put(root, 'Makefile', 'test:\n\tgo test ./...\n');
      put(root, 'src/main.go', 'package main\n\nfunc main() {}\n');
      put(root, '.gitignore', 'build/\n');
      put(root, 'build/out.txt', 'ignored\n');
      git(root, home, 'add', 'README.md', 'Makefile', 'src', '.gitignore');
      git(root, home, 'commit', '-qm', 'fixture');
      put(root, 'café notes.md', 'note\n');
      put(root, 'empty.txt', '');
      put(root, 'notes/todo.txt', 'todo\n');
      return;
    case 'kinds':
      put(root, 'small.txt', 'hello\n');
      put(root, 'exact.txt', 'x'.repeat(4095) + '\n');
      put(root, 'over.txt', 'y'.repeat(4096) + '\n');
      put(root, 'binary.dat', 'a\0b\n');
      put(root, 'latin1.txt', Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]));
      put(root, 'lines.txt', '\n'.repeat(4096));
      put(root, 'café notes.md', 'note\n');
      put(root, 'pipe', 'p\n');
      put(root, 'gone.txt', 'gone\n');
      fs.writeFileSync(path.join(root, '..', 'secret.txt'), 'secret\n');
      fs.symlinkSync('small.txt', path.join(root, 'link.txt'));
      fs.symlinkSync('../secret.txt', path.join(root, 'outside.txt'));
      git(root, home, 'add', '-A');
      git(root, home, 'commit', '-qm', 'fixture');
      fs.rmSync(path.join(root, 'gone.txt'));
      fs.rmSync(path.join(root, 'pipe'));
      assert.equal(spawnSync('mkfifo', [path.join(root, 'pipe')]).status, 0, 'mkfifo');
      return;
    case 'one-file':
      put(root, 'a.txt', 'a\n');
      return;
    case 'paths-64': case 'paths-65':
      for (let i = 0; i < (mode === 'paths-64' ? 64 : 65); i++) put(root, 'f' + String(i).padStart(2, '0') + '.txt', 'x\n');
      return;
    case 'bytes-32768': case 'bytes-32769':
      for (let i = 0; i < 8; i++) put(root, 'k' + i + '.txt', 'z'.repeat(4095) + '\n');
      put(root, 'big.txt', 'b'.repeat(4999) + '\n');
      if (mode === 'bytes-32769') put(root, 'one.txt', 'x');
      return;
    case 'empty-repo':
      return;
  }
  throw new Error('unknown workspace snapshot fixture ' + mode);
}
function userTexts(input, snapshot) {
  return (input || []).filter(x => x && x.role === 'user' && (x.type === undefined || x.type === 'message')).map(x => {
    const text = typeof x.content === 'string' ? x.content : (x.content || []).map(p => p.text).join('');
    if (snapshot !== undefined && text === snapshot) return 'SNAPSHOT';
    if (text.startsWith(HEADER)) return 'OTHER SNAPSHOT: ' + text;
    return text;
  });
}
// parse splits a snapshot into its listing and its read_file sections (real names).
function parse(text) {
  const head = HEADER + '\n\nlist_files:\n';
  if (!text.startsWith(head)) return undefined;
  const parts = text.slice(head.length).split(/\n\nread_file ("(?:[^"\\]|\\.)*"):\n/);
  const sections = [];
  for (let i = 1; i < parts.length; i += 2) sections.push({name:JSON.parse(parts[i]), text:parts[i + 1]});
  return {listing:parts[0], sections};
}
// runOnce runs the built CLI once against a local scripted Responses provider. The scripted
// model answers a request that carries a snapshot with one list_files call and one read_file
// call per shown file, so the next request shows what those tools really return; any other
// request is answered without a tool call.
async function runOnce(bin, root, home, task, seen, onRequest) {
  let server, child, timer, failure;
  try {
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/v1/responses');
        let raw = ''; for await (const chunk of req) raw += chunk;
        const items = onRequest(JSON.parse(raw));
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        for (let i = 0; i < items.length; i++) res.write('data: ' + JSON.stringify({type:'response.output_item.done', output_index:i, item:items[i]}) + '\n\n');
        res.end('data: ' + JSON.stringify({type:'response.completed', response:{status:'completed'}}) + '\n\n');
      } catch (e) { failure = failure || e; res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:e.message}})); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let stdout = '', stderr = '';
    child = spawn(bin, ['run', '--task', '-'], {cwd:root, env:{...gitEnv(home), KOGEN_PROVIDER_URL:'http://127.0.0.1:' + server.address().port}});
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
    child.stdin.end(JSON.stringify(task));
    let timedOut = false;
    timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 30000);
    const code = await closed;
    if (failure) throw failure;
    assert.equal(timedOut, false, 'CLI did not finish within 30 s (an opening that blocks?): ' + stderr);
    const error = stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s)).find(e => e.type === 'error');
    if (error) seen.error = error.detail;
    return code;
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
}
async function run(mode, tools) {
  const bin = binary();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-workspace-snapshot-'));
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive:true});
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now() / 1000) + 3600}));
    fixture(mode === 'resume' ? 'small' : mode, root, home);
    const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''}, instructions:'', prompt:TASK, tools, protected:[], excluded:[], terminal:['finish'], deadline_seconds:0, session:{dir:mode === 'resume' ? path.join(dir, 'session') : '', resume:false}, requires:[]};
    const done = {type:'message', role:'assistant', content:[{type:'output_text', text:'done'}]};
    const seen = {};
    if (mode === 'resume') {
      let snapshot;
      seen.exit = await runOnce(bin, root, home, task, seen, body => {
        const texts = userTexts(body.input);
        snapshot = texts.length > 1 && texts[1].startsWith('OTHER SNAPSHOT: ') ? texts[1].slice('OTHER SNAPSHOT: '.length) : undefined;
        seen.openingUserTexts = userTexts(body.input, snapshot);
        return [done];
      });
      if (seen.exit !== 0) return seen;
      put(root, 'added later.txt', 'later\n'); // a snapshot taken again would differ
      seen.resumedRequests = 0;
      seen.exit = await runOnce(bin, root, home, {...task, prompt:'more feedback', session:{...task.session, resume:true}}, seen, body => {
        if (++seen.resumedRequests === 1) seen.resumedUserTexts = userTexts(body.input, snapshot);
        return [done];
      });
      return seen;
    }
    seen.requests = 0;
    let parsed, shownCalls;
    seen.exit = await runOnce(bin, root, home, task, seen, body => {
      const n = ++seen.requests;
      assert.ok(n <= 3, 'workspace snapshot fixture request count');
      if (n === 1) {
        seen.inputItems = (body.input || []).length;
        const raw = userTexts(body.input);
        const snapshot = raw.length > 1 && raw[1].startsWith('OTHER SNAPSHOT: ') ? raw[1].slice('OTHER SNAPSHOT: '.length) : undefined;
        seen.userTexts = userTexts(body.input, snapshot);
        if (snapshot === undefined) return [done];
        seen.snapshot = snapshot;
        parsed = parse(snapshot);
        seen.listing = parsed.listing.split('\n');
        seen.listed = seen.listing.length;
        seen.shown = parsed.sections.map(s => s.name);
        const call = (id, name, args) => ({type:'function_call', call_id:id, name, arguments:JSON.stringify(args)});
        shownCalls = parsed.sections.map((s, i) => ({id:'read' + i, section:s}));
        return [call('list', 'list_files', {}), ...shownCalls.map(c => call(c.id, 'read_file', {path:c.section.name}))];
      }
      seen.secondUserTexts = userTexts(body.input, seen.snapshot);
      const outputs = new Map((body.input || []).filter(x => x.type === 'function_call_output').map(x => [x.call_id, x.output]));
      seen.listingMatchesListFiles = outputs.get('list') === parsed.listing;
      seen.sectionsMatchReadFile = shownCalls.every(c => outputs.get(c.id) === c.section.text);
      if (!seen.sectionsMatchReadFile) seen.mismatched = shownCalls.filter(c => outputs.get(c.id) !== c.section.text).map(c => c.section.name);
      return [done];
    });
    return seen;
  } finally {
    fs.rmSync(dir, {recursive:true, force:true});
  }
}
// exercise runs a scenario's fixture, or each of its combined fixture runs.
async function exercise(scenario) {
  if (!MODES[scenario]) return run(scenario, ALL);
  const seen = {};
  for (const [label, [mode, tools]] of Object.entries(MODES[scenario])) seen[label] = await run(mode, tools);
  return seen;
}
if (require.main === module) {
  if (process.argv[2] === '--control') {
    if (process.argv[3] === 'good') {
      for (const want of Object.values(EXPECTED)) observe(structuredClone(want), want);
      console.log('workspace snapshot observer accepted');
    } else {
      const wrong = v => typeof v === 'boolean' ? !v : typeof v === 'number' ? v + 1 : typeof v === 'string' ? v + 'x' : [...v, 'x'];
      for (const want of Object.values(EXPECTED)) {
        for (const keys of leaves(want)) {
          assert.throws(() => observe(edit(want, keys, (o, k) => { o[k] = wrong(o[k]); }), want), undefined, 'must reject ' + keys.join('.'));
          assert.throws(() => observe(edit(want, keys, (o, k) => { delete o[k]; }), want), undefined, 'must reject missing ' + keys.join('.'));
        }
      }
      console.log('workspace snapshot observer rejected'); process.exitCode = 1;
    }
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('I run the workspace snapshot CLI fixture {string}', {timeout:110000}, async function(mode) { this.workspaceSnapshot = await exercise(mode); });
  Then('the workspace snapshot observations are:', function(text) { observe(this.workspaceSnapshot, JSON.parse(text)); });
}
