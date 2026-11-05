'use strict';
// Acceptance driver of l-session-transcript-read-bounded.
// The CLI scenarios build the real CLI (go build ./cmd/kogen-loop) and run `kogen-loop run
// --task -` against a local scripted Responses provider (chatgpt with a fake stored login and
// KOGEN_PROVIDER_URL). A first run writes session.json into a private session directory, the
// scenario changes that file, and a second run resumes it. The library scenarios write a sparse
// session.json (or pad a written one to the bound) and run DRIVER_SOURCE through go -overlay at
// the virtual path DRIVER: it calls loop.ResumeSession on that directory and prints the session
// id or the error, the heap bytes the call allocated and its time. This file judges what they
// observed; the Gherkin owns the expected values.
// `node features/steps/l-session-transcript-read-bounded__resume.js --control good|bad` checks
// the observer against builds of loop/session.go patched through go -overlay: good reads the
// transcript within a bound and must pass every check; bad runs today's file and two wrong
// readings, each of which must fail exactly the checks named in VARIANTS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

const root = process.cwd();
const SESSION_GO = 'loop/session.go';
const DRIVER = 'features/steps/l-session-transcript-read-bounded__driver.go';
const DRIVER_SOURCE = String.raw`//go:build ignore

// Acceptance collector of l-session-transcript-read-bounded. It resumes the session directory
// named by its second argument through loop.ResumeSession and prints one JSON line: the session
// id or the error, the heap bytes the call allocated and its time. The JS observer owns the
// expectations.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"runtime"
	"time"

	"github.com/KogenAI/kogen-loop/loop"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
)

func main() {
	if len(os.Args) != 3 {
		fmt.Fprintln(os.Stderr, "usage: driver <root> <session dir>")
		os.Exit(2)
	}
	cfg := loop.SessionConfig{
		Root: os.Args[1], Role: provider.Role{Provider: "chatgpt", Model: "fixture-model", Effort: "medium"},
		Enabled: []string{"read_file"}, Terminal: []string{"finish"}, Dir: os.Args[2],
	}
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	began := time.Now()
	s, err := loop.ResumeSession(cfg)
	elapsed := time.Since(began)
	runtime.ReadMemStats(&after)
	out := map[string]any{"allocated": after.TotalAlloc - before.TotalAlloc, "elapsed_ms": elapsed.Milliseconds(), "resumed": s != nil, "session_id": nil, "error": nil}
	if s != nil {
		out["session_id"] = s.ID()
	}
	if err != nil {
		var se *sys.Error
		if errors.As(err, &se) {
			out["error"] = map[string]any{"class": se.Class, "reason": se.Reason, "detail": se.Detail, "exit": se.Exit}
		} else {
			out["error"] = map[string]any{"text": err.Error()}
		}
	}
	if err := json.NewEncoder(os.Stdout).Encode(out); err != nil {
		os.Exit(1)
	}
}
`;

// ---- private directories and Go ----

const owned = [];
function temp(label) {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'l-session-transcript-read-bounded-' + label + '-')));
  owned.push(d);
  return d;
}
function cleanup() { for (const d of owned.splice(0)) fs.rmSync(d, {recursive: true, force: true}); }
// Keep the caller's HOME and PATH: toolchain shims (mise) resolve go through them. PWD is the
// root so that go resolves the overlay's absolute paths as they are written.
function goEnv() { return {...process.env, PWD: root, LC_ALL: 'C', GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off'}; }

// ---- the observer controls' readings of loop/session.go ----

const READ = '\tdata, err := os.ReadFile(path)\n';
const DECODE = '\tvar t transcript\n\tdec := json.NewDecoder(bytes.NewReader(data))\n';
const IMPORT = '\t"io/fs"\n';
const LIMIT = '\nconst lstrbLimit = 64 << 20\n';
const TOO_LARGE = size => '\t\treturn nil, mismatch(fmt.Sprintf("the session transcript at %s is %d bytes, more than the limit of %d bytes", path, ' + size + ', lstrbLimit))\n';
function patch(s, from, to) {
  assert.ok(s.includes(from), SESSION_GO + ' has no ' + JSON.stringify(from));
  return s.replace(from, to);
}
// bounded opens the file, refuses a size above the bound (or at it, when inclusive) before
// reading, and decodes from the open file.
function bounded(s, inclusive) {
  s = patch(s, IMPORT, '\t"io"\n' + IMPORT);
  s = patch(s, READ, '\tf, err := os.Open(path)\n');
  s = patch(s, DECODE, '\tdefer f.Close()\n\tst, err := f.Stat()\n\tif err != nil {\n\t\treturn nil, mismatch("cannot read the session transcript: " + err.Error())\n\t}\n' +
    '\tif st.Size() ' + (inclusive ? '>=' : '>') + ' lstrbLimit {\n' + TOO_LARGE('st.Size()') + '\t}\n' +
    '\tvar t transcript\n\tdec := json.NewDecoder(io.LimitReader(f, lstrbLimit))\n');
  return s + LIMIT;
}
const VARIANTS = {
  good: {source: s => bounded(s, false), fails: []},
  today: {source: s => patch(s, READ, READ), fails: ['over-cli', 'over-library', 'at-bound-library']},
  inclusive: {source: s => bounded(s, true), fails: ['at-bound', 'at-bound-library']},
  'read-whole': {source: s => patch(s, DECODE, '\tif len(data) > lstrbLimit {\n' + TOO_LARGE('len(data)') + '\t}\n' + DECODE) + LIMIT, fails: ['over-library', 'at-bound-library']},
};

// overlay writes the driver and, for a control variant, the patched loop/session.go, and
// returns the overlay file.
const overlays = new Map();
function overlay(variant) {
  if (!overlays.has(variant)) {
    const d = temp('overlay');
    fs.writeFileSync(path.join(d, 'driver.go'), DRIVER_SOURCE);
    const replace = {[path.join(root, DRIVER)]: path.join(d, 'driver.go')};
    if (variant) {
      fs.writeFileSync(path.join(d, 'session.go'), VARIANTS[variant].source(fs.readFileSync(path.join(root, SESSION_GO), 'utf8')));
      replace[path.join(root, SESSION_GO)] = path.join(d, 'session.go');
    }
    fs.writeFileSync(path.join(d, 'overlay.json'), JSON.stringify({Replace: replace}));
    overlays.set(variant, path.join(d, 'overlay.json'));
  }
  return overlays.get(variant);
}
function go(args) {
  const r = spawnSync('go', args, {cwd: root, env: goEnv(), encoding: 'utf8', timeout: 240000, maxBuffer: 32 << 20});
  const why = '`go ' + args.join(' ') + '` exited ' + r.status + (r.signal ? ' (' + r.signal + ')' : '') + (r.error ? ' ' + r.error.message : '') + '\n' + r.stdout + r.stderr;
  assert.equal(r.status, 0, why);
  return {stdout: r.stdout, stderr: r.stderr, why};
}
const binaries = new Map();
function binary(variant) {
  if (!binaries.has(variant)) {
    const bin = path.join(temp('bin'), 'kogen-loop');
    go(['build', '-overlay', overlay(variant), '-o', bin, './cmd/kogen-loop']);
    binaries.set(variant, bin);
  }
  return binaries.get(variant);
}

// ---- the scripted provider and one CLI run ----

const USAGE = {input_tokens: 3, input_tokens_details: {cached_tokens: 0}, output_tokens: 3, output_tokens_details: {reasoning_tokens: 0}};
const finishCall = id => ({type: 'function_call', call_id: id, name: 'finish', arguments: JSON.stringify({summary: 'first'})});
const message = text => ({type: 'message', id: 'msg-fixture', role: 'assistant', content: [{type: 'output_text', text, annotations: []}]});

// world is a private root, HOME with a stored ChatGPT login and a session directory path.
function world(variant) {
  const base = temp('world');
  const w = {variant, base, root: path.join(base, 'root'), home: path.join(base, 'home'), dir: path.join(base, 'session')};
  fs.mkdirSync(w.root);
  const creds = path.join(w.home, '.kogen', 'credentials');
  fs.mkdirSync(creds, {recursive: true});
  fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id: 'oaiapp_fixture', access_token: 'fake-access-token', refresh_token: 'fake-refresh-token', expires_at: Math.floor(Date.now() / 1000) + 3600}));
  return w;
}
function task(w, prompt, resume) {
  return {protocol: 'kogen-loop/v1', root: w.root, role: {provider: 'chatgpt', model: 'fixture-model', effort: 'medium', base_url: ''},
    instructions: '', prompt, tools: ['read_file'], protected: [], excluded: [], terminal: ['finish'], deadline_seconds: 0,
    session: {dir: w.dir, resume}, requires: []};
}
// run runs the CLI once; the provider answers request n with answers[n - 1].
async function run(w, prompt, resume, answers) {
  const bin = binary(w.variant);
  const bodies = [];
  let failure, child, timer;
  const server = http.createServer(async (req, res) => {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      bodies.push(JSON.parse(raw));
      assert.equal(req.url, '/v1/responses');
      assert.ok(bodies.length <= answers.length, 'unexpected provider request ' + bodies.length);
      res.writeHead(200, {'Content-Type': 'text/event-stream'});
      answers[bodies.length - 1].forEach((item, i) => res.write('data: ' + JSON.stringify({type: 'response.output_item.done', output_index: i, item}) + '\n\n'));
      res.end('data: ' + JSON.stringify({type: 'response.completed', response: {id: 'resp-' + bodies.length, status: 'completed', usage: USAGE}}) + '\n\n');
    } catch (e) {
      failure = failure || e;
      res.writeHead(400, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: {message: e.message}}));
    }
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const env = {HOME: w.home, TMPDIR: os.tmpdir(), PATH: process.env.PATH, KOGEN_PROVIDER_URL: 'http://127.0.0.1:' + server.address().port};
    let stdout = '', stderr = '', timedOut = false;
    const began = Date.now();
    child = spawn(bin, ['run', '--task', '-'], {cwd: w.root, env});
    child.stdout.on('data', b => stdout += b);
    child.stderr.on('data', b => stderr += b);
    const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
    child.stdin.end(JSON.stringify(task(w, prompt, resume)));
    timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 120000);
    const exit = await closed;
    const ms = Date.now() - began;
    if (failure) throw failure;
    assert.equal(timedOut, false, 'the CLI did not finish within 120 s: ' + stderr);
    const events = stdout.split('\n').filter(Boolean).map(s => JSON.parse(s));
    return {exit, events, bodies, stderr, ms};
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

// ---- the steps' actions and judgments (shared with the controls) ----

const transcriptPath = w => path.join(w.dir, 'session.json');

async function seed(w, callId) {
  const r = await run(w, 'start', false, [[finishCall(callId)]]);
  assert.equal(r.exit, 0, 'the first (writing) run exited ' + r.exit + ': ' + r.stderr + JSON.stringify(r.events));
  w.saved = fs.readFileSync(transcriptPath(w), 'utf8');
  w.savedTranscript = JSON.parse(w.saved);
  w.sessionId = w.savedTranscript.session_id;
  assert.ok(w.sessionId, 'the first run wrote a session id: ' + w.saved);
}
function pad(w, size) {
  const now = fs.statSync(transcriptPath(w)).size;
  assert.ok(now <= size, 'the written transcript (' + now + ' bytes) is larger than ' + size);
  const fd = fs.openSync(transcriptPath(w), 'a');
  try {
    const chunk = Buffer.alloc(1 << 20, 0x20);
    for (let left = size - now; left > 0; left -= chunk.length) fs.writeSync(fd, chunk, 0, Math.min(left, chunk.length));
  } finally { fs.closeSync(fd); }
  assert.equal(fs.statSync(transcriptPath(w)).size, size, 'padded transcript size');
}
function sparse(file, size) {
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  fs.rmSync(file, {force: true});
  const fd = fs.openSync(file, 'w', 0o600);
  try { fs.ftruncateSync(fd, size); } finally { fs.closeSync(fd); }
  assert.equal(fs.statSync(file).size, size, 'sparse transcript size');
}
function replaceText(w, text) { fs.writeFileSync(transcriptPath(w), text, {mode: 0o600}); }
function remove(w) { fs.rmSync(transcriptPath(w)); }
async function resume(w, prompt, answer) { w.resumed = await run(w, prompt, true, [[message(answer)]]); }

const why = r => ' (exit ' + r.exit + ', events ' + JSON.stringify(r.events) + ', stderr ' + JSON.stringify(r.stderr) + ')';
function exitsAfter(w, exit, requests) {
  const r = w.resumed;
  assert.equal(r.exit, exit, 'resume exit' + why(r));
  assert.equal(r.bodies.length, requests, 'provider requests of the resume' + why(r));
}
const ENVELOPE = ['protocol', 'seq', 'time'];
function emitted(w, doc) {
  const want = JSON.parse(doc.split('<dir>').join(w.dir));
  const got = w.resumed.events.map(e => Object.fromEntries(Object.entries(e).filter(([k]) => !ENVELOPE.includes(k))));
  assert.deepEqual(got, want, 'events of the resume' + why(w.resumed));
}
function startedResumed(w) {
  const s = w.resumed.events.filter(e => e.type === 'session.started');
  assert.equal(s.length, 1, 'one session.started' + why(w.resumed));
  assert.equal(s[0].resumed, true, 'session.started resumed' + why(w.resumed));
  assert.equal(s[0].session_id, w.sessionId, 'session.started session_id is the saved one' + why(w.resumed));
}
function continued(w, output, callId) {
  const sent = w.resumed.bodies[0];
  assert.ok(sent, 'the resume sent a request' + why(w.resumed));
  assert.deepEqual(sent.input, [...w.savedTranscript.input, {type: 'function_call_output', call_id: callId, output}],
    'the resumed request input is the saved input followed by the feedback; saved ' + JSON.stringify(w.savedTranscript.input));
}
function ended(w, ending, claim) {
  const e = w.resumed.events.filter(x => x.type === 'round.ended');
  assert.equal(e.length, 1, 'one round.ended' + why(w.resumed));
  assert.equal(e[0].ending, ending, 'round.ended ending' + why(w.resumed));
  assert.equal(e[0].claim, claim, 'round.ended claim' + why(w.resumed));
}
function rewritten(w) {
  const t = JSON.parse(fs.readFileSync(transcriptPath(w), 'utf8'));
  const sent = w.resumed.bodies[0].input;
  assert.equal(t.session_id, w.sessionId, 'session.json session_id after the resume');
  assert.equal(t.terminal, null, 'session.json terminal after a no-call ending');
  assert.deepEqual(t.input.slice(0, sent.length), sent, 'session.json input after the resume starts with the resumed request input');
  assert.equal(t.input.length, sent.length + 1, 'session.json input after the resume adds the answer: ' + JSON.stringify(t.input.slice(sent.length)));
}

function library(w) {
  const r = go(['run', '-overlay', overlay(w.variant), DRIVER, w.root, w.dir]);
  assert.equal(r.stderr, '', 'driver stderr: ' + r.why);
  const lines = r.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, 'one JSON line from the driver: ' + r.why);
  w.library = JSON.parse(lines[0]);
}
function libraryError(w, doc) {
  const want = JSON.parse(doc.split('<dir>').join(w.dir));
  assert.deepEqual({resumed: w.library.resumed, error: w.library.error}, {resumed: false, error: want}, 'loop.ResumeSession observed ' + JSON.stringify(w.library));
}
function librarySession(w) {
  assert.deepEqual({resumed: w.library.resumed, session_id: w.library.session_id, error: w.library.error}, {resumed: true, session_id: w.sessionId, error: null},
    'loop.ResumeSession observed ' + JSON.stringify(w.library));
}
function libraryCost(w, bytes, ms) {
  assert.ok(w.library.allocated < bytes, 'loop.ResumeSession allocated ' + w.library.allocated + ' heap bytes, want fewer than ' + bytes + ': ' + JSON.stringify(w.library));
  assert.ok(w.library.elapsed_ms <= ms, 'loop.ResumeSession took ' + w.library.elapsed_ms + ' ms, want at most ' + ms + ': ' + JSON.stringify(w.library));
}

// ---- the observer controls: the feature's checks, with the feature's values ----

const BOUND = 67108864;
const refusal = detail => JSON.stringify([{type: 'error', class: 'loop', reason: 'session_mismatch', detail}, {type: 'session.ended', status: 'failed', exit: 2}]);
const CHECKS = {
  normal: async w => { await seed(w, 'c1'); await resume(w, 'feedback: check again', 'second answer'); exitsAfter(w, 0, 1); startedResumed(w); continued(w, 'feedback: check again', 'c1'); ended(w, 'no_call', 'second answer'); rewritten(w); },
  'at-bound': async w => { await seed(w, 'c1'); pad(w, BOUND); await resume(w, 'feedback: check again', 'second answer'); exitsAfter(w, 0, 1); startedResumed(w); continued(w, 'feedback: check again', 'c1'); ended(w, 'no_call', 'second answer'); },
  'over-cli': async w => { await seed(w, 'c1'); sparse(transcriptPath(w), BOUND + 1); await resume(w, 'feedback: check again', 'never'); exitsAfter(w, 2, 0);
    emitted(w, refusal('the session transcript at <dir>/session.json is 67108865 bytes, more than the limit of 67108864 bytes')); },
  'over-library': async w => { sparse(transcriptPath(w), BOUND + 1); library(w);
    libraryError(w, JSON.stringify({class: 'loop', reason: 'session_mismatch', detail: 'the session transcript at <dir>/session.json is 67108865 bytes, more than the limit of 67108864 bytes', exit: 2}));
    libraryCost(w, 4194304, 1000); },
  'at-bound-library': async w => { await seed(w, 'c1'); pad(w, BOUND); library(w); librarySession(w); libraryCost(w, 4194304, 1000); },
  missing: async w => { await seed(w, 'c1'); remove(w); await resume(w, 'feedback: check again', 'never'); exitsAfter(w, 2, 0); emitted(w, refusal('no session transcript at <dir>/session.json')); },
  invalid: async w => { await seed(w, 'c1'); replaceText(w, 'not json'); await resume(w, 'feedback: check again', 'never'); exitsAfter(w, 2, 0);
    emitted(w, refusal("the session transcript is not valid: invalid character 'o' in literal null (expecting 'u')")); },
};
async function failing(variant) {
  const fails = [];
  for (const [name, check] of Object.entries(CHECKS)) {
    try { await check(world(variant)); } catch (e) {
      if (!(e instanceof assert.AssertionError)) throw e;
      fails.push(name);
    }
  }
  return fails;
}
async function control(kind) {
  const names = kind === 'good' ? ['good'] : ['today', 'inclusive', 'read-whole'];
  for (const v of names) {
    const fails = await failing(v);
    assert.deepEqual(fails, VARIANTS[v].fails, 'checks failed by the ' + v + ' reading of ' + SESSION_GO);
  }
  if (kind === 'good') {
    process.stdout.write('l-session-transcript-read-bounded observer good\n');
    return;
  }
  process.stdout.write('l-session-transcript-read-bounded observer bad rejected\n');
  process.exitCode = 1;
}

if (require.main === module) {
  (async () => {
    try {
      assert.equal(process.argv[2], '--control');
      assert.ok(['good', 'bad'].includes(process.argv[3]));
      await control(process.argv[3]);
    } catch (e) { console.error(e.stack); process.exitCode = 2; } finally { cleanup(); }
  })();
} else {
  const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
  const P = 'l-session-transcript-read-bounded: ';
  // Each scenario gets its own private world on its first step.
  const W = ctx => ctx.lstrb || (ctx.lstrb = world(null));
  Given(P + 'a session directory written by a short session that ended with the finish call {string}', {timeout: 300000}, async function (id) { await seed(W(this), id); });
  Given(P + 'its session.json is padded with spaces to exactly {int} bytes', function (size) { pad(W(this), size); });
  Given(P + 'its session.json is replaced by a sparse file of {int} bytes', function (size) { sparse(transcriptPath(W(this)), size); });
  Given(P + 'its session.json is replaced by the text {string}', function (text) { replaceText(W(this), text); });
  Given(P + 'its session.json is removed', function () { remove(W(this)); });
  Given(P + 'a session directory whose only file is a sparse session.json of {int} bytes', function (size) { sparse(transcriptPath(W(this)), size); });
  When(P + 'I resume it through the CLI with the prompt {string} while the provider answers {string}', {timeout: 300000}, async function (prompt, answer) { await resume(W(this), prompt, answer); });
  When(P + 'I resume it through loop.ResumeSession', {timeout: 300000}, function () { library(W(this)); });
  Then(P + 'the resume exits {int} after {int} provider request(s)', function (exit, n) { exitsAfter(W(this), exit, n); });
  Then(P + 'the resume emitted exactly these events:', function (doc) { emitted(W(this), doc); });
  Then(P + 'session.started carries the saved session id with resumed true', function () { startedResumed(W(this)); });
  Then(P + 'the resumed request input is the saved input followed by the output {string} for call {string}', function (output, id) { continued(W(this), output, id); });
  Then(P + 'the round ended {string} with the claim {string}', function (ending, claim) { ended(W(this), ending, claim); });
  Then(P + 'session.json now holds the saved session id, terminal null and the resumed input followed by the answer', function () { rewritten(W(this)); });
  Then(P + 'loop.ResumeSession returned no session and the error:', function (doc) { libraryError(W(this), doc); });
  Then(P + 'loop.ResumeSession returned the saved session without an error', function () { librarySession(W(this)); });
  Then(P + 'the call allocated fewer than {int} heap bytes and returned within {int} ms', function (bytes, ms) { libraryCost(W(this), bytes, ms); });
  AfterAll(cleanup);
}
