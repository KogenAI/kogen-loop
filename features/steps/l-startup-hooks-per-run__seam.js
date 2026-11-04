'use strict';
// Acceptance driver of l-startup-hooks-per-run: shell-start test hooks carried by each
// sys.Session (Session.StartHook) instead of a package-level variable.
// - The concurrency harness (the Go program exported by l-startup-hooks-per-run__harness.js) runs
//   with `go run -race -overlay` as a package that exists only in the overlay; nothing is
//   written to the tree.
// - The existing startup tests are run with `go test -race -json`: one check requires them to
//   have run and passed, others judge their t.Parallel pause records and their times.
// - The source check reads sys/*.go, loop/*_test.go and conformance/*_test.go (and every .go
//   file for go:linkname into sys).
// - The no-hook session runs the built CLI against a local scripted Responses provider.
// `node features/steps/l-startup-hooks-per-run__seam.js --control good|bad`, run from the
// unchanged base tree, checks these observers against a known-good seam (applied only through
// overlays) and known-bad implementations and records.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

const MOD = 'github.com/KogenAI/kogen-loop/';
const HARNESS = require('./l-startup-hooks-per-run__harness.js');
const HARNESS_PKG = 'zz_l_startup_hooks_per_run_accept';
const HARNESS_OK = 'l-startup-hooks-per-run harness: ok\n';
const STAGES = ['enter', 'starting', 'started'];
const STARTUP = ['TestShellLifecycleCancelStartup', 'TestShellLifecycleDeadlineStartup'];
const TEARDOWN = 'TestToolOverlapTeardown';
const TEARDOWN_STARTING = TEARDOWN + '/starting_shell_on_cancel';

const tmps = [];
process.on('exit', () => { for (const d of tmps) fs.rmSync(d, {recursive:true, force:true}); });
function tmpdir(tag) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'l-startup-hooks-per-run-' + tag + '-'));
  tmps.push(d);
  return d;
}
function tail(s) { return s.length > 6000 ? s.slice(-6000) : s; }

// ---- go test -json ----

// writeOverlay writes a go -overlay file: overlay maps repository-relative paths to file
// contents that replace (or add) those files for one go command only.
function writeOverlay(cwd, overlay) {
  const dir = tmpdir('overlay'), replace = {};
  for (const [rel, text] of Object.entries(overlay)) {
    const file = path.join(dir, rel.split('/').join('__'));
    fs.writeFileSync(file, text);
    replace[path.join(cwd, rel)] = file;
  }
  const json = path.join(dir, 'overlay.json');
  fs.writeFileSync(json, JSON.stringify({Replace:replace}));
  return json;
}
// goTest runs go test -json in cwd, with an optional overlay (see writeOverlay).
function goTest(cwd, args, timeout, overlay) {
  const argv = ['test', '-count=1', '-json'];
  if (overlay) argv.push('-overlay', writeOverlay(cwd, overlay));
  argv.push(...args);
  const r = spawnSync('go', argv, {cwd, encoding:'utf8', timeout, maxBuffer:256 << 20});
  const run = {command:'go ' + argv.join(' '), cwd, status:r.status, error:r.error ? String(r.error) : '', events:{}, output:{}, raw:(r.stdout || '') + (r.stderr || '')};
  for (const line of (r.stdout || '').split('\n')) {
    if (!line.startsWith('{')) continue;
    let e; try { e = JSON.parse(line); } catch (_) { continue; }
    if (!e.Test) continue;
    const key = e.Package + ' ' + e.Test;
    if (e.Action === 'output') { run.output[key] = (run.output[key] || '') + e.Output; continue; }
    (run.events[key] = run.events[key] || []).push({action:e.Action, time:Date.parse(e.Time) / 1000, elapsed:e.Elapsed});
  }
  return run;
}
function where(run, test, pkg) {
  return 'test ' + test + ' in package ' + pkg + ' (command: ' + run.command + ' in ' + run.cwd + '; exit ' + run.status + (run.error ? ', ' + run.error : '') + ')';
}
function final(run, test, pkg) {
  const ev = (run.events[MOD + pkg + ' ' + test] || []).filter(e => ['pass', 'fail', 'skip'].includes(e.action));
  return ev.length ? ev[ev.length - 1] : null;
}
function actions(run, test, pkg) { return (run.events[MOD + pkg + ' ' + test] || []).map(e => e.action); }
function outputOf(run, test, pkg) { return run.output[MOD + pkg + ' ' + test] || ''; }
// runner is what go test itself printed for the test: its === and --- lines.
function runner(run, test, pkg) {
  const lines = outputOf(run, test, pkg).split('\n').map(l => l.trim()).filter(l => /^(=== (RUN|PAUSE|CONT)|--- (PASS|FAIL|SKIP):)/.test(l));
  return lines.length ? lines.join('; ') : '(go test printed no === or --- line for it)';
}
// passed requires the named test to have run and passed.
function passed(run, test, pkg) {
  const ran = actions(run, test, pkg).includes('run');
  const got = final(run, test, pkg);
  assert.ok(ran, where(run, test, pkg) + ' did not run (absent, build failure or zero runs):\n' + tail(run.raw));
  assert.ok(got, where(run, test, pkg) + ' ran but reported no result (still running when go test stopped):\n' + tail(run.raw));
  assert.equal(got.action, 'pass', where(run, test, pkg) + ' outcome ' + got.action + ':\n' + tail(outputOf(run, test, pkg) || run.raw));
  return got;
}

// ---- concurrency harness ----
function harness(cwd, overlay) {
  const json = writeOverlay(cwd, Object.assign({[HARNESS_PKG + '/main.go']:HARNESS}, overlay || {}));
  const argv = ['run', '-race', '-overlay', json, './' + HARNESS_PKG];
  const r = spawnSync('go', argv, {cwd, encoding:'utf8', timeout:280000, maxBuffer:64 << 20});
  return {command:'go ' + argv.join(' '), cwd, status:r.status, error:r.error ? String(r.error) : '', out:(r.stdout || '') + (r.stderr || '')};
}
function checkHarness(r) {
  assert.ok(r.status === 0 && r.out === HARNESS_OK, 'the concurrency harness (command: ' + r.command + ' in ' + r.cwd + ') exited ' + r.status + (r.error ? ', ' + r.error : '') + ' and printed:\n' + tail(r.out) + '\nwant exit 0 and exactly ' + JSON.stringify(HARNESS_OK));
}

// ---- startup tests: parallel and overlapping ----
function startupRun(cwd, overlay) {
  return goTest(cwd, ['-race', '-parallel', '16', '-run', '^(' + STARTUP.join('|') + ')$', './conformance'], 280000, overlay);
}
const STARTUP_ALL = [...STARTUP, ...STARTUP.flatMap(p => STAGES.map(s => p + '/' + s)), STARTUP[1] + '/cli'];
// checkRanPassed requires every named test to have run and passed, as go test reported it.
function checkRanPassed(run, pkg, tests) {
  const bad = [];
  for (const test of tests) { try { passed(run, test, pkg); } catch (e) { bad.push(e.message); } }
  assert.equal(bad.length, 0, bad.join('\n'));
}
// checkParallel requires every named test, which ran and passed, to be marked parallel: go test
// printed "=== PAUSE <test>" for it (a pause record), which only t.Parallel causes.
function checkParallel(run, pkg, tests) {
  const bad = [];
  for (const test of tests) {
    let got;
    try { got = passed(run, test, pkg); } catch (e) { bad.push(e.message); continue; }
    if (!actions(run, test, pkg).includes('pause')) bad.push(test + ' ran and passed after ' + got.elapsed + ' s, as go test reported it (' + runner(run, test, pkg) + '), but go test printed no "=== PAUSE ' + test + '": it does not call t.Parallel');
  }
  assert.equal(bad.length, 0, 'command: ' + run.command + ' in ' + run.cwd + ' (exit ' + run.status + '); each test must be marked parallel:\n' + bad.join('\n'));
}
// checkSpan requires the six stage rounds together to take no longer than the longest of them
// plus margin seconds. A round runs from its last run or cont record for its Elapsed seconds
// (go test reports a parallel subtest's pass record only once earlier siblings have reported,
// so the record's own time is not when the round ended). It returns the measurement.
function checkSpan(run, margin) {
  const pkg = 'conformance';
  let start = Infinity, end = -Infinity, longest = 0;
  const ran = [];
  for (const test of STARTUP.flatMap(p => STAGES.map(s => p + '/' + s))) {
    const got = passed(run, test, pkg);
    ran.push(test + ' ' + got.elapsed + ' s (' + runner(run, test, pkg) + ')');
    const begin = Math.max(...(run.events[MOD + pkg + ' ' + test] || []).filter(e => e.action === 'run' || e.action === 'cont').map(e => e.time));
    start = Math.min(start, begin);
    end = Math.max(end, begin + got.elapsed);
    longest = Math.max(longest, got.elapsed);
  }
  const span = Math.round((end - start) * 1000) / 1000;
  assert.ok(span <= longest + margin, 'the six startup rounds of ' + STARTUP.join(' and ') + ' took ' + span + ' s from the first round starting to the last one ending, more than the longest single round (' + longest + ' s) plus ' + margin + ' s: they ran and passed but not at the same time (command: ' + run.command + '; rounds: ' + ran.join('; ') + ')');
  return {span, longest};
}

// ---- loop teardown: starting-shell case ----
function teardownRun(cwd, overlay) {
  return goTest(cwd, ['-race', '-run', '^' + TEARDOWN + '$', './loop'], 280000, overlay);
}

// ---- source check ----
function sourceFiles(root) {
  const files = {};
  const walk = rel => {
    for (const ent of fs.readdirSync(path.join(root, rel), {withFileTypes:true})) {
      const r = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) { if (!['.git', '.kogen', 'features', 'node_modules'].includes(ent.name)) walk(r); }
      else if (ent.isFile() && r.endsWith('.go')) files[r] = fs.readFileSync(path.join(root, r), 'utf8');
    }
  };
  walk('');
  return files;
}
const SCANNED = r => /^sys\/[^/]+\.go$/.test(r) || /^(loop|conformance)\/[^/]+_test\.go$/.test(r);
const HOOK_TYPE = /^func\s*\(\s*(\w+\s+)?string\s*\)\s*$/;
// scan lists package-level variables in sys/*.go, loop/*_test.go and conformance/*_test.go
// whose name contains "hook" or whose declared type is func(string), and every go:linkname
// directive (in any .go file) that names a symbol of the sys package.
function scan(files) {
  const found = [];
  for (const [rel, text] of Object.entries(files)) {
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      if (/^\s*\/\/go:linkname\s/.test(line) && line.includes(MOD + 'sys.')) found.push(rel + ':' + (i + 1) + ': ' + line.trim());
    });
    if (!SCANNED(rel)) continue;
    let block = false;
    lines.forEach((line, i) => {
      let decl = null;
      if (/^var\s*\(\s*$/.test(line)) { block = true; return; }
      if (block && /^\)/.test(line)) { block = false; return; }
      if (block && /^\t[A-Za-z_]/.test(line)) decl = line.slice(1);
      else if (/^var\s+[A-Za-z_]/.test(line)) decl = line.replace(/^var\s+/, '');
      if (!decl) return;
      const m = /^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*)\s*(.*)$/.exec(decl.replace(/\s*\/\/.*$/, ''));
      if (!m) return;
      const names = m[1].split(',').map(s => s.trim());
      const type = m[2].split('=')[0].trim();
      if (names.some(n => /hook/i.test(n)) || HOOK_TYPE.test(type)) found.push(rel + ':' + (i + 1) + ': ' + line.trim());
    });
  }
  return found.sort();
}
function checkScan(found) {
  assert.deepEqual(found, [], 'package-level shell-start hook variables or go:linkname into sys found:\n' + found.join('\n'));
}

// ---- no-hook CLI session ----
const CALLS = [['one', 'shell', {command:'echo l-shp-one'}], ['two', 'shell', {command:'echo l-shp-two; exit 3'}]];
const USAGE = {input_tokens:3, input_tokens_details:{cached_tokens:0}, output_tokens:3, output_tokens_details:{reasoning_tokens:0}};
const VOLATILE = new Set(['time', 'session_id', 'conversation_id', 'attempt_id', 'operation_id', 'timestamp', 'load_average', 'gap_hist', 'spawned', 'wait_started', 'wait_ended']);
// mask replaces the values of timing and identity fields by "<v>".
function mask(v) {
  if (Array.isArray(v)) return v.map(mask);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, VOLATILE.has(k) || k.endsWith('_ms') ? '<v>' : mask(x)]));
  return v;
}
function build(cwd) {
  const bin = path.join(tmpdir('bin'), 'kogen-loop');
  const r = spawnSync('go', ['build', '-o', bin, './cmd/kogen-loop'], {cwd, encoding:'utf8', timeout:200000});
  assert.equal(r.status, 0, 'go build ./cmd/kogen-loop in ' + cwd + ': ' + r.stdout + r.stderr + (r.error || ''));
  return bin;
}
// session runs the CLI once against the scripted provider (two shell calls, then finish) and
// returns its exit code, its masked events and its request bodies with the session id as
// <session> and the root as <root>.
async function session(bin) {
  const dir = fs.realpathSync(tmpdir('cli'));
  const root = path.join(dir, 'root'); fs.mkdirSync(root);
  const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive:true});
  fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now() / 1000) + 3600}));
  const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''}, instructions:'', prompt:'fixture task', tools:['shell'], protected:[], excluded:[], terminal:['finish'], deadline_seconds:0, session:{dir:'', resume:false}, requires:[]};
  const bodies = [];
  let server, child, timer, failure;
  try {
    server = http.createServer(async (req, res) => {
      try {
        let raw = ''; for await (const c of req) raw += c;
        assert.equal(req.url, '/v1/responses');
        bodies.push(raw);
        const n = bodies.length;
        assert.ok(n <= CALLS.length + 1, 'scripted session request count ' + n);
        const item = n <= CALLS.length
          ? {type:'function_call', call_id:CALLS[n - 1][0], name:CALLS[n - 1][1], arguments:JSON.stringify(CALLS[n - 1][2])}
          : {type:'function_call', call_id:'end', name:'finish', arguments:JSON.stringify({summary:'done'})};
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        res.write('data: ' + JSON.stringify({type:'response.output_item.done', output_index:0, item}) + '\n\n');
        res.end('data: ' + JSON.stringify({type:'response.completed', response:{id:'resp-' + n, status:'completed', usage:USAGE}}) + '\n\n');
      } catch (e) { failure = failure || e; res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:e.message}})); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let stdout = '', stderr = '';
    child = spawn(bin, ['run', '--task', '-'], {cwd:root, env:{HOME:home, TMPDIR:os.tmpdir(), PATH:process.env.PATH, KOGEN_PROVIDER_URL:'http://127.0.0.1:' + server.address().port}});
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
    child.stdin.end(JSON.stringify(task));
    let timedOut = false;
    timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 120000);
    const exit = await closed;
    if (failure) throw failure;
    assert.equal(timedOut, false, 'the CLI did not finish within 120 s: ' + stderr);
    const events = stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
    const started = events.find(e => e.type === 'session.started');
    const id = started ? started.session_id : '<none>';
    const norm = s => s.split(id).join('<session>').split(root).join('<root>');
    return {exit, stderr, events:events.map(e => JSON.stringify(mask(JSON.parse(norm(JSON.stringify(e)))))), bodies:bodies.map(norm)};
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  }
}
const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
function checkEvents(obs, text) {
  assert.equal(obs.exit, 0, 'CLI exit code; stderr: ' + obs.stderr);
  assert.deepEqual(obs.events, text.trim().split('\n').map(l => JSON.stringify(JSON.parse(l))), 'masked event stream of the no-hook session');
}
function checkBodies(obs, rows) {
  const got = obs.bodies.map((b, i) => [String(i + 1), String(Buffer.byteLength(b, 'utf8')), sha256(b)]);
  assert.deepEqual(got, rows, 'request bodies (number, bytes, sha256 with the session id as <session>):\n' + obs.bodies.join('\n'));
}
function outputs(obs) {
  const last = JSON.parse(obs.bodies[obs.bodies.length - 1]);
  return Object.fromEntries((last.input || []).filter(x => x.type === 'function_call_output').map(x => [x.call_id, x.output]));
}

// ---- known-good and known-bad seams for the controls (overlays only) ----
function edit(text, edits, file) {
  for (const [anchor, replacement] of edits) {
    const n = text.split(anchor).length - 1;
    if (n !== 1) throw new Error('control anchor ' + JSON.stringify(anchor) + ' occurs ' + n + ' times in ' + file);
    text = text.replace(anchor, () => replacement);
  }
  return text;
}
const FIELD = ['\tstop      context.CancelFunc\n}\n', '\tstop      context.CancelFunc\n\n\tStartHook func(stage string)\n}\n'];
const CALLERS = STAGES.map(s => ['\thookStart("' + s + '")', '\ts.hookStart("' + s + '")']);
const SYS = {
  good: [FIELD, ['func hookStart(stage string) {\n\tif h := startHook; h != nil {', 'func (s *Session) hookStart(stage string) {\n\tif h := s.StartHook; h != nil {'], ...CALLERS, ['var startHook func(stage string)\n', '']],
  ignored: [FIELD],
  firstWins: [FIELD, ['func hookStart(stage string) {\n\tif h := startHook; h != nil {', 'func (s *Session) hookStart(stage string) {\n\tif startHook == nil {\n\t\tstartHook = s.StartHook\n\t}\n\tif h := startHook; h != nil {'], ...CALLERS],
};
const LINK_CONF = '//go:linkname shellStartHook github.com/KogenAI/kogen-loop/sys.startHook\nvar shellStartHook func(stage string)\n';
const TESTS = {
  'conformance/shell_lifecycle_test.go': [[LINK_CONF, ''], ['\tshellStartHook = func(s string) {', '\tl.sess.StartHook = func(s string) {'], ['\tdefer func() { shellStartHook = nil }()\n', ''],
    ['func TestShellLifecycleCancelStartup(t *testing.T) {\n\tfor _, stage := range []string{"enter", "starting", "started"} {\n\t\tt.Run(stage, func(t *testing.T) {\n', 'func TestShellLifecycleCancelStartup(t *testing.T) {\n\tt.Parallel()\n\tfor _, stage := range []string{"enter", "starting", "started"} {\n\t\tt.Run(stage, func(t *testing.T) {\n\t\t\tt.Parallel()\n'],
    ['func TestShellLifecycleDeadlineStartup(t *testing.T) {\n\tfor _, stage := range []string{"enter", "starting", "started"} {\n\t\tt.Run(stage, func(t *testing.T) {\n', 'func TestShellLifecycleDeadlineStartup(t *testing.T) {\n\tt.Parallel()\n\tfor _, stage := range []string{"enter", "starting", "started"} {\n\t\tt.Run(stage, func(t *testing.T) {\n\t\t\tt.Parallel()\n'],
    ['\tt.Run("cli", func(t *testing.T) {\n', '\tt.Run("cli", func(t *testing.T) {\n\t\tt.Parallel()\n']],
  'loop/tool_overlap_teardown_test.go': [[LINK_CONF, ''], ['\t\tshellStartHook = func(stage string) {', '\t\tf.sess.StartHook = func(stage string) {'], ['\t\tt.Cleanup(func() { shellStartHook = nil })\n', ''],
    ['\tt.Run("starting shell on cancel", func(t *testing.T) {\n', '\tt.Run("starting shell on cancel", func(t *testing.T) {\n\t\tt.Parallel()\n']],
};
function overlayFor(cwd, sysEdits, tests) {
  const o = {'sys/sys.go':edit(fs.readFileSync(path.join(cwd, 'sys/sys.go'), 'utf8'), sysEdits, 'sys/sys.go')};
  if (tests) for (const [rel, edits] of Object.entries(TESTS)) o[rel] = edit(fs.readFileSync(path.join(cwd, rel), 'utf8'), edits, rel);
  return o;
}
function rejects(name, fn, reason) {
  try { fn(); } catch (e) {
    if (reason && !String(e.message).includes(reason)) throw new Error('control "' + name + '" was rejected for another reason than ' + JSON.stringify(reason) + ':\n' + e.message);
    return;
  }
  throw new Error('control "' + name + '" was accepted; the observer must reject it');
}

// EXPECTED repeats the feature's no-hook expectations for the observer controls.
const EXPECTED = {
  outputs:{"one":"exit status: 0\nl-shp-one\n","two":"exit status: 3\nl-shp-two\n"},
  // SHA-256 of the feature's masked event lines joined by \n.
  eventsSha256:'c497683683f575bd87427ae98401296054f5ae7f08d20ebeeca644854f377c7c',
  bodies:[["1", "1778", "97756d817be453316f027017627763074c40656c905e8ad0ee22fd2755db7fb7"], ["2", "1968", "7a01ee1f5aa2c11456075f4296cc0f66a91a6c87829841641653e05532148e2b"], ["3", "2166", "4f7ec966bffa4d93b58d29402a13b12e1db1a3037ad5311cbf4d6c6878880e78"]],
};

if (require.main === module) {
  const cwd = process.cwd();
  const mode = process.argv[2] === '--control' ? process.argv[3] : '';
  (async () => {
    const rows = EXPECTED.bodies;
    const obs = await session(build(cwd));
    const events = obs.events.join('\n');
    if (mode === 'good') {
      // The feature's literals are the recorded base observation.
      const feature = fs.readFileSync(path.join(__dirname, '..', '..', '.kogen', 'intents', 'l-startup-hooks-per-run', 'acceptance.feature'), 'utf8');
      const doc = /the masked events of the no-hook session are:\n\s*"""\n([\s\S]*?)\n\s*"""/.exec(feature);
      assert.ok(doc, 'the feature has no masked events docstring');
      assert.equal(sha256(doc[1].split('\n').map(l => l.trim()).join('\n')), EXPECTED.eventsSha256, 'the feature\'s masked events against the recorded base stream');
      const out = /the outputs delivered to the model are:\n\s*"""\n\s*(.*)\n/.exec(feature);
      assert.deepEqual(out && JSON.parse(out[1]), EXPECTED.outputs, 'the feature\'s outputs against the recorded base outputs');
      assert.deepEqual([...feature.matchAll(/^\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*([0-9a-f]{64})\s*\|\s*$/gm)].map(m => [m[1], m[2], m[3]]), rows, 'the feature\'s request body rows against the recorded base bodies');
      checkHarness(harness(cwd, overlayFor(cwd, SYS.good, true)));
      const good = startupRun(cwd, overlayFor(cwd, SYS.good, true));
      checkRanPassed(good, 'conformance', STARTUP_ALL);
      checkParallel(good, 'conformance', STARTUP_ALL);
      checkSpan(good, 1);
      const teardown = teardownRun(cwd, overlayFor(cwd, SYS.good, true));
      checkRanPassed(teardown, 'loop', [TEARDOWN, TEARDOWN_STARTING]);
      checkParallel(teardown, 'loop', [TEARDOWN_STARTING]);
      // The unchanged tree's real runs are accepted as having run and passed.
      checkRanPassed(startupRun(cwd), 'conformance', STARTUP_ALL);
      checkRanPassed(teardownRun(cwd), 'loop', [TEARDOWN, TEARDOWN_STARTING]);
      const files = sourceFiles(cwd);
      for (const [rel, text] of Object.entries(overlayFor(cwd, SYS.good, true))) files[rel] = text;
      checkScan(scan(files));
      assert.deepEqual(outputs(obs), EXPECTED.outputs, 'function_call_output texts of the last request');
      assert.equal(sha256(events), EXPECTED.eventsSha256, 'masked event stream of the base no-hook session against the feature');
      checkEvents(obs, events);
      checkBodies(obs, rows);
      console.log('l-startup-hooks-per-run observer accepted');
    } else if (mode === 'bad') {
      rejects('unchanged tree without the hook field', () => checkHarness(harness(cwd)), 'StartHook');
      rejects('ignored hook field', () => checkHarness(harness(cwd, overlayFor(cwd, SYS.ignored, false))), 'never stopped at its hold stage');
      rejects('first session hook wins process-wide', () => checkHarness(harness(cwd, overlayFor(cwd, SYS.firstWins, false))), 'the concurrency harness');
      const serial = startupRun(cwd);
      rejects('serial startup tests', () => checkParallel(serial, 'conformance', STARTUP_ALL), 'does not call t.Parallel');
      rejects('serial startup rounds', () => checkSpan(serial, 1), 'but not at the same time');
      rejects('serial starting-shell teardown case', () => checkParallel(teardownRun(cwd), 'loop', [TEARDOWN_STARTING]), 'does not call t.Parallel');
      rejects('absent test', () => checkRanPassed(serial, 'conformance', ['TestShellLifecycleNoSuchTest']), 'did not run');
      rejects('process-global hook variables', () => checkScan(scan(sourceFiles(cwd))), 'sys/sys.go');
      assert.deepEqual(scan(sourceFiles(cwd)), [
        'conformance/shell_lifecycle_test.go:30: //go:linkname shellStartHook github.com/KogenAI/kogen-loop/sys.startHook',
        'conformance/shell_lifecycle_test.go:31: var shellStartHook func(stage string)',
        'loop/tool_overlap_teardown_test.go:20: //go:linkname shellStartHook github.com/KogenAI/kogen-loop/sys.startHook',
        'loop/tool_overlap_teardown_test.go:21: var shellStartHook func(stage string)',
        'sys/sys.go:185: var startHook func(stage string)',
      ]);
      const changedBody = {...obs, bodies:obs.bodies.map((b, i) => i === 1 ? b.replace('exit status: 0', 'exit status: 1') : b)};
      rejects('changed request body', () => checkBodies(changedBody, rows), 'request bodies');
      const extraField = {...obs, events:obs.events.map(e => e.includes('"type":"tool.result"') ? e.replace('{', '{"hook":"enter",') : e)};
      rejects('extra event field', () => checkEvents(extraField, events), 'masked event stream');
      rejects('missing event', () => checkEvents({...obs, events:obs.events.slice(0, -1)}, events), 'masked event stream');
      console.log('l-startup-hooks-per-run observer rejected');
      process.exitCode = 1;
    } else {
      console.log('usage: --control good|bad');
      process.exitCode = 2;
    }
  })().catch(e => { console.log('control error: ' + e.message); process.exitCode = 3; });
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  const P = 'l-startup-hooks-per-run: ';
  Given(P + 'sys.Session has the start hook field {string}', {timeout:120000}, function (symbol) {
    const r = spawnSync('go', ['doc', './sys', symbol], {encoding:'utf8', timeout:110000});
    assert.equal(r.status, 0, 'go doc ./sys ' + symbol + ' (exit ' + r.status + '): ' + r.stdout + r.stderr);
    assert.match(r.stdout, /StartHook\s+func\(stage string\)/, 'go doc ./sys ' + symbol + ' must show the field StartHook func(stage string):\n' + r.stdout);
  });
  When(P + 'I run the concurrent startup harness under -race', {timeout:300000}, function () { this.lshpHarness = harness(process.cwd()); });
  Then(P + 'each round stopped at its own stage and neither was released or blocked by the other\'s hook', function () { checkHarness(this.lshpHarness); });
  When(P + 'I run the cancel and deadline startup tests under -race with parallel scheduling', {timeout:300000}, function () { this.lshpRun = startupRun(process.cwd()); });
  Then(P + 'every startup test and subtest ran and passed', function () { checkRanPassed(this.lshpRun, 'conformance', STARTUP_ALL); });
  Then(P + 'every startup test and subtest is marked parallel', function () { checkParallel(this.lshpRun, 'conformance', STARTUP_ALL); });
  Then(P + 'the six startup rounds together took no longer than the longest single round plus {int} second(s)', function (margin) {
    console.log('startup rounds: ' + JSON.stringify(checkSpan(this.lshpRun, margin)));
  });
  When(P + 'I run the loop teardown test under -race', {timeout:300000}, function () { this.lshpRun = teardownRun(process.cwd()); });
  Then(P + 'the loop teardown test and its starting-shell case ran and passed', function () { checkRanPassed(this.lshpRun, 'loop', [TEARDOWN, TEARDOWN_STARTING]); });
  Then(P + 'the starting-shell teardown case is marked parallel', function () { checkParallel(this.lshpRun, 'loop', [TEARDOWN_STARTING]); });
  When(P + 'I scan sys and the loop tests\' support code for shell-start hook variables', function () { this.lshpFound = scan(sourceFiles(process.cwd())); });
  Then(P + 'no package-level shell-start hook variable or go:linkname into sys is found', function () { checkScan(this.lshpFound); });
  When(P + 'I run the built CLI on a session without a start hook', {timeout:300000}, async function () { this.lshpCLI = await session(build(process.cwd())); });
  Then(P + 'the outputs delivered to the model are:', function (text) { assert.deepEqual(outputs(this.lshpCLI), JSON.parse(text), 'function_call_output texts of the last request'); });
  Then(P + 'the masked events of the no-hook session are:', function (text) { checkEvents(this.lshpCLI, text); });
  Then(P + 'the request bodies, with the session id as <session>, are:', function (table) { checkBodies(this.lshpCLI, table.raw().slice(1)); });
}
