'use strict';
// Acceptance driver of l-tool-result-elapsed.
// The CLI scenario builds the real CLI and runs it against a local scripted Responses
// provider: the first answer is two shell calls in one response (sleep 0.2 and sleep 1.2),
// the second one batch of every other kind of tool result (read, write, list, search, image,
// documentation, a refused and a malformed shell call, an unknown tool), the third finish. It
// observes the events on stdout and the request bodies the provider receives.
// The harness scenario copies the tree (without .git, .kogen and features) to a private
// directory, adds HARNESS_GO as a test of package loop and runs it with go test: one
// loop.Session round on an injected clock (tools.Tools.Now, set by reflection so the harness
// also runs where the field does not exist yet) whose two probe calls in one response advance
// that clock by 200 and 1200 ms. The harness writes what it observed; this file judges it.
// `node features/steps/l-tool-result-elapsed__session.js --control good|bad` checks the
// observer on synthetic runs built from EXPECTED.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const {spawn, spawnSync} = require('node:child_process');

const INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{9}Z$/;
const SECOND = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const MS = 1000000n;
// nsOf is an RFC 3339 UTC instant with nine fractional digits as BigInt Unix nanoseconds.
const nsOf = s => BigInt(Date.parse(s.slice(0, 19) + 'Z')) * MS + BigInt(s.slice(20, 29));
// secondOf is the start (in BigInt Unix nanoseconds) of an event time such as 2026-11-05T00:14:51Z.
const secondOf = s => BigInt(Date.parse(s)) * MS;
const sha256 = s => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const ENVELOPE = ['protocol', 'seq', 'time', 'type'];
const extras = (e, base) => Object.fromEntries(Object.entries(e).filter(([k]) => ![...ENVELOPE, ...base].includes(k)));

// ---- the CLI session ----

const NOTES = 'l-tre-needle line';
// CLI_BATCHES are the scripted model's responses, one per request: [call_id, tool, arguments].
const CLI_BATCHES = [
  [['short', 'shell', {command:'sleep 0.2'}], ['long', 'shell', {command:'sleep 1.2'}]],
  [['read', 'read_file', {path:'l-tre-notes.txt'}], ['write', 'write_file', {path:'l-tre-written.txt', content:'l-tre-written-text\n'}],
    ['list', 'list_files', {}], ['search', 'search_text', {pattern:'l-tre-needle'}], ['image', 'view_image', {path:'l-tre-missing.png'}],
    ['docs', 'documentation', {operation:'l-tre-unsupported'}], ['refused', 'shell', {command:'pkill -f l-tre-nothing-at-all'}],
    ['malformed', 'shell', {}], ['unknown', 'l_tre_no_such_tool', {}]],
  [['end', 'finish', {summary:'done'}]],
];
const CLI_TOOLS = ['shell', 'read_file', 'write_file', 'list_files', 'search_text', 'view_image', 'documentation'];

let built;
function binary() {
  if (!built) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-tool-result-elapsed-bin-'));
    process.on('exit', () => fs.rmSync(dir, {recursive:true, force:true}));
    const bin = path.join(dir, 'kogen-loop');
    const build = spawnSync('go', ['build', '-o', bin, './cmd/kogen-loop'], {encoding:'utf8', timeout:240000});
    assert.equal(build.status, 0, 'go build ./cmd/kogen-loop: ' + build.stdout + build.stderr + (build.error || ''));
    built = bin;
  }
  return built;
}
const USAGE = {input_tokens:3, input_tokens_details:{cached_tokens:0}, output_tokens:3, output_tokens_details:{reasoning_tokens:0}};
// runCli runs the built CLI once against the scripted provider and returns the raw run.
async function runCli() {
  const bin = binary();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'l-tool-result-elapsed-')));
  let server, child, timer, failure;
  try {
    const root = path.join(dir, 'root'); fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'l-tre-notes.txt'), NOTES + '\n');
    const home = path.join(dir, 'home'); const creds = path.join(home, '.kogen', 'credentials'); fs.mkdirSync(creds, {recursive:true});
    const git = spawnSync('git', ['init', '-q'], {cwd:root, env:{HOME:home, PATH:process.env.PATH}, encoding:'utf8'});
    assert.equal(git.status, 0, 'git init of the fixture root: ' + git.stdout + git.stderr);
    fs.writeFileSync(path.join(creds, 'chatgpt.json'), JSON.stringify({client_id:'oaiapp_fixture', access_token:'fake-access-token', refresh_token:'fake-refresh-token', expires_at:Math.floor(Date.now() / 1000) + 3600}));
    const task = {protocol:'kogen-loop/v1', root, role:{provider:'chatgpt', model:'fixture-model', effort:'medium', base_url:''}, instructions:'', prompt:'fixture task', tools:CLI_TOOLS, protected:[], excluded:[], terminal:['finish'], deadline_seconds:0, session:{dir:'', resume:false}, requires:[]};
    const outputs = {}, bodies = [];
    server = http.createServer(async (req, res) => {
      try {
        assert.equal(req.url, '/v1/responses');
        let raw = ''; for await (const chunk of req) raw += chunk;
        bodies.push(raw);
        const body = JSON.parse(raw);
        assert.ok(bodies.length <= CLI_BATCHES.length, 'scripted session request count ' + bodies.length);
        for (const x of body.input || []) if (x.type === 'function_call_output') outputs[x.call_id] = x.output;
        res.writeHead(200, {'Content-Type':'text/event-stream'});
        CLI_BATCHES[bodies.length - 1].forEach(([id, name, args], i) => res.write('data: ' + JSON.stringify({type:'response.output_item.done', output_index:i, item:{type:'function_call', call_id:id, name, arguments:JSON.stringify(args)}}) + '\n\n'));
        res.end('data: ' + JSON.stringify({type:'response.completed', response:{id:'resp-' + bodies.length, status:'completed', usage:USAGE}}) + '\n\n');
      } catch (e) { failure = failure || e; res.writeHead(400, {'Content-Type':'application/json'}); res.end(JSON.stringify({error:{message:e.message}})); }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let stdout = '', stderr = '';
    const env = {HOME:home, TMPDIR:os.tmpdir(), PATH:process.env.PATH, KOGEN_PROVIDER_URL:'http://127.0.0.1:' + server.address().port};
    const started = BigInt(Date.now()) * MS;
    child = spawn(bin, ['run', '--task', '-'], {cwd:root, env});
    child.stdout.on('data', b => stdout += b); child.stderr.on('data', b => stderr += b);
    const closed = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
    child.stdin.end(JSON.stringify(task));
    let timedOut = false;
    timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 120000);
    const exit = await closed;
    const ended = BigInt(Date.now()) * MS;
    if (failure) throw failure;
    assert.equal(timedOut, false, 'CLI did not finish within 120 s: ' + stderr);
    assert.equal(bodies.length, CLI_BATCHES.length, 'scripted session requests; stderr: ' + stderr);
    const events = stdout.trim().split('\n').filter(Boolean).map(s => JSON.parse(s));
    return {kind:'cli', events, outputs, bodies, exit, error:'', seam:'', started, ended, leaks:['l-tre-', 'sleep', dir]};
  } finally {
    clearTimeout(timer);
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    fs.rmSync(dir, {recursive:true, force:true});
  }
}

// ---- the session harness on an injected clock ----

const HARNESS_TEST = 'TestLToolResultElapsedHarness';
const HARNESS_GO = String.raw`package loop

// Acceptance collector of l-tool-result-elapsed, copied into a private copy of the tree as a
// test of package loop. It runs one loop.Session round against a local scripted Chat
// Completions provider with the session's tools on an injected clock (tools.Tools.Now, set
// by reflection so the collector also runs where the field does not exist yet) and a probe
// seam that advances that clock by the milliseconds its command names. It writes what it
// observed to $L_TRE_OUT; the JS observer and the Gherkin own the expectations.

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/KogenAI/kogen-loop/api"
	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
	"github.com/KogenAI/kogen-loop/tools"
)

func TestLToolResultElapsedHarness(t *testing.T) {
	out := os.Getenv("L_TRE_OUT")
	if out == "" {
		t.Fatal("L_TRE_OUT is not set")
	}
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "l-tre-clock.txt"), []byte("l-tre-clock-text\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	// Each response of the scripted provider: [call id, tool name, arguments].
	batches := [][][3]string{
		{{"p200", "probe", "{\"command\":\"200\"}"}, {"p1200", "probe", "{\"command\":\"1200\"}"}},
		{{"read", "read_file", "{\"path\":\"l-tre-clock.txt\"}"}, {"refused", "shell", "{\"command\":\"pkill -f l-tre-nothing-at-all\"}"},
			{"malformed", "shell", "{}"}, {"unknown", "l_tre_no_such_tool", "{}"}},
		{{"end", "finish", "{\"summary\":\"done\"}"}},
	}
	var mu sync.Mutex
	var bodies []string
	outputs := map[string]any{}
	requests := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		mu.Lock()
		bodies = append(bodies, string(raw))
		var body struct {
			Messages []map[string]any ` + '`json:"messages"`' + String.raw`
		}
		_ = json.Unmarshal(raw, &body)
		for _, m := range body.Messages {
			if m["role"] == "tool" {
				if id, ok := m["tool_call_id"].(string); ok {
					outputs[id] = m["content"]
				}
			}
		}
		n := requests
		requests++
		mu.Unlock()
		if n >= len(batches) {
			n = len(batches) - 1
		}
		var calls []any
		for _, c := range batches[n] {
			calls = append(calls, map[string]any{"id": c[0], "type": "function", "function": map[string]any{"name": c[1], "arguments": c[2]}})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"choices": []any{map[string]any{
			"message": map[string]any{"role": "assistant", "content": nil, "tool_calls": calls}, "finish_reason": "tool_calls"}}})
	}))
	defer srv.Close()
	var events []json.RawMessage
	s, err := NewSession(SessionConfig{
		Root: root, Role: provider.Role{Provider: "openai-compatible", Model: "local", BaseURL: srv.URL},
		Session: sys.NewWith([]string{"HOME=" + t.TempDir(), "PATH=" + os.Getenv("PATH")}, root),
		Emit: func(e api.Event) {
			b, err := json.Marshal(e)
			if err != nil {
				t.Errorf("event %v: %v", e, err)
			}
			events = append(events, b)
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	// The injected clock stands still except while a probe call runs: the probe advances it
	// by the milliseconds its command names.
	base := time.Date(2026, 11, 5, 10, 0, 0, 0, time.UTC)
	var advanced time.Duration
	now := func() time.Time {
		mu.Lock()
		defer mu.Unlock()
		return base.Add(advanced)
	}
	seam := "set"
	if f := reflect.ValueOf(s.tools).Elem().FieldByName("Now"); !f.IsValid() {
		seam = "tools.Tools has no field Now"
	} else if f.Type() != reflect.TypeOf(now) {
		seam = "tools.Tools.Now has type " + f.Type().String() + ", not func() time.Time"
	} else {
		f.Set(reflect.ValueOf(now))
	}
	s.tools.Enabled = append(s.tools.Enabled, tools.ProbeTool)
	s.tools.Probe = func(command string, files any) (string, error) {
		ms, err := strconv.Atoi(command)
		if err != nil {
			return "error: probe command is not a number of milliseconds", nil
		}
		mu.Lock()
		advanced += time.Duration(ms) * time.Millisecond
		mu.Unlock()
		return "probe ran " + command + " ms", nil
	}
	started := time.Now()
	res, roundErr := s.Round(context.Background(), "go")
	ended := time.Now()
	obs := map[string]any{
		"seam": seam, "root": root, "started": started.UnixNano(), "ended": ended.UnixNano(), "ending": string(res.Ending),
		"error": "", "events": events, "outputs": outputs, "bodies": bodies, "requests": requests,
	}
	if roundErr != nil {
		obs["error"] = roundErr.Error()
	}
	b, err := json.Marshal(obs)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(out, b, 0o644); err != nil {
		t.Fatal(err)
	}
}
`;
// runHarness runs HARNESS_GO in a private copy of the tree and returns the raw run.
function runHarness() {
  const cwd = process.cwd();
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'l-tool-result-elapsed-copy-')));
  try {
    const copy = path.join(dir, 'tree');
    fs.cpSync(cwd, copy, {recursive:true, filter:src => !['.git', '.kogen', 'features'].includes(path.relative(cwd, src).split(path.sep)[0])});
    fs.writeFileSync(path.join(copy, 'loop', 'zz_l_tool_result_elapsed_harness_test.go'), HARNESS_GO);
    const out = path.join(dir, 'observation.json');
    const args = ['test', '-json', '-count=1', '-timeout=120s', '-run', '^' + HARNESS_TEST + '$', './loop'];
    const r = spawnSync('go', args, {cwd:copy, env:{...process.env, L_TRE_OUT:out}, encoding:'utf8', timeout:240000, maxBuffer:64 << 20});
    const lines = (r.stdout || '').split('\n').flatMap(l => { try { return [JSON.parse(l)]; } catch { return []; } });
    const mine = lines.filter(e => e.Test === HARNESS_TEST);
    const outcome = mine.some(e => e.Action === 'pass') ? 'passed' : mine.some(e => e.Action === 'fail') ? 'failed'
      : mine.some(e => e.Action === 'skip') ? 'skipped' : mine.some(e => e.Action === 'run') ? 'ran without an outcome' : 'absent (ran zero times)';
    const where = HARNESS_TEST + ' (go ' + args.join(' ') + ' in a private copy of the tree; exit ' + r.status + (r.error ? '; ' + r.error : '') + '): ' + outcome;
    const text = mine.map(e => e.Output || '').join('') || ((r.stdout || '') + (r.stderr || '')).slice(-4000);
    assert.ok(r.status === 0 && outcome === 'passed' && fs.existsSync(out), 'the harness test must run and pass: ' + where + '\n' + text);
    const o = JSON.parse(fs.readFileSync(out, 'utf8'));
    return {kind:'harness', events:o.events || [], outputs:o.outputs || {}, bodies:o.bodies || [], exit:o.error === '' ? 0 : 1, error:o.error,
      seam:o.seam, started:BigInt(o.started), ended:BigInt(o.ended), leaks:['l-tre-', o.root]};
  } finally {
    fs.rmSync(dir, {recursive:true, force:true});
  }
}

// ---- observation ----

// summarize turns a raw run into the observation the steps compare.
function summarize(run) {
  const {events, outputs} = run;
  const callEvents = {}, results = {}, described = {}, others = {}, calls = {};
  for (const e of events) {
    if (e.type === 'tool.call') { callEvents[e.call_id] = extras(e, ['call_id', 'name', 'arguments_sha256']); calls[e.call_id] = e; }
    else if (e.type === 'tool.result') {
      results[e.call_id] = extras(e, ['call_id', 'name', 'result_sha256', 'bytes', 'cut']);
      const out = outputs[e.call_id];
      const name = calls[e.call_id] ? calls[e.call_id].name : undefined;
      described[e.call_id] = typeof out === 'string' && e.name === name && e.cut === false
        && e.result_sha256 === sha256(out) && e.bytes === Buffer.byteLength(out, 'utf8')
        ? 'matches' : 'differs: ' + JSON.stringify({name:e.name, cut:e.cut, result_sha256:e.result_sha256, bytes:e.bytes});
    } else {
      const keys = JSON.stringify(Object.keys(extras(e, [])).sort());
      (others[e.type] = others[e.type] || new Set()).add(keys);
    }
  }
  const timing = [], times = [];
  for (const e of events) {
    if (!SECOND.test(e.time) || secondOf(e.time) + 1000n * MS <= run.started || secondOf(e.time) > run.ended) times.push(e.seq + ' ' + e.type + ': time ' + e.time + ' is not a whole second of the real run');
  }
  for (const e of events.filter(e => e.type === 'tool.result')) {
    const ms = e.elapsed_ms, c = calls[e.call_id];
    if (!Number.isInteger(ms) || ms < 0) { timing.push(e.call_id + ': elapsed_ms ' + JSON.stringify(ms) + ' is not a non-negative integer'); continue; }
    if (!c || !SECOND.test(c.time) || !SECOND.test(e.time) || BigInt(ms) * MS > secondOf(e.time) + 1000n * MS - secondOf(c.time)) timing.push(e.call_id + ': elapsed_ms ' + ms + ' exceeds the seconds of its tool.call and tool.result events');
    const w = e.shell_wait;
    if (w && typeof w === 'object' && INSTANT.test(w.wait_started) && INSTANT.test(w.wait_ended) && BigInt(ms + 1) * MS < nsOf(w.wait_ended) - nsOf(w.wait_started)) timing.push(e.call_id + ': elapsed_ms ' + ms + ' is shorter than its shell wait');
  }
  const ended = events.find(e => e.type === 'round.ended');
  return {
    exit:run.exit, error:run.error, seam:run.seam, ending:ended ? ended.ending : null, terminal:ended ? ended.terminal_tool : null,
    errors:events.filter(e => e.type === 'error').map(e => ({class:e.class, reason:e.reason, detail:e.detail})),
    outputs, described, tools:{callEvents, results},
    elapsed:Object.fromEntries(Object.entries(results).map(([id, x]) => [id, x.elapsed_ms])), timing, times,
    others:Object.fromEntries(Object.entries(others).map(([t, s]) => [t, s.size === 1 ? JSON.parse([...s][0]) : {mixed:[...s].map(k => JSON.parse(k))}])),
    mentioning:run.bodies.filter(b => b.includes('elapsed_ms')).length,
    logged:run.leaks.filter(t => t && events.some(e => JSON.stringify(e).includes(t))),
  };
}
// placeheld shows every non-negative integer elapsed_ms as "ms" and every shell_wait instant
// as "instant", so a value in another form shows as it is.
function placeheld(tools) {
  const results = Object.fromEntries(Object.entries(tools.results).map(([id, x]) => {
    const y = {...x};
    if (Number.isInteger(y.elapsed_ms) && y.elapsed_ms >= 0) y.elapsed_ms = 'ms';
    if (y.shell_wait && typeof y.shell_wait === 'object' && !Array.isArray(y.shell_wait)) {
      y.shell_wait = Object.fromEntries(Object.entries(y.shell_wait).map(([k, v]) => [k, k !== 'ended_by' && typeof v === 'string' && INSTANT.test(v) ? 'instant' : v]));
    }
    return [id, y];
  }));
  return {callEvents:tools.callEvents, results};
}
const checks = {
  end(obs) {
    assert.deepEqual({exit:obs.exit, error:obs.error, ending:obs.ending, terminal:obs.terminal, errors:obs.errors}, {exit:0, error:'', ending:'terminal', terminal:'finish', errors:[]}, 'session end');
  },
  seam(obs) { assert.equal(obs.seam, 'set', 'the injected clock on the session\'s tools.Tools.Now'); },
  outputs(obs, want) { assert.deepEqual(obs.outputs, want, 'outputs delivered to the model'); },
  described(obs) {
    assert.deepEqual(obs.described, Object.fromEntries(Object.keys(obs.outputs).map(id => [id, 'matches'])), 'tool.result name, cut, result_sha256 and bytes against the delivered outputs');
  },
  tools(obs, want) { assert.deepEqual(obs.tools, want, 'fields tool.call and tool.result events add: ' + JSON.stringify(obs.tools)); },
  placeheld(obs, want) { const got = placeheld(obs.tools); assert.deepEqual(got, want, 'fields tool.call and tool.result events add: ' + JSON.stringify(got)); },
  ranges(obs, rows) {
    const got = {}, want = {};
    for (const r of rows) {
      const ms = obs.elapsed[r.call];
      want[r.call] = 'within [' + r.from + ', ' + r.below + ')';
      got[r.call] = Number.isInteger(ms) && ms >= Number(r.from) && ms < Number(r.below) ? want[r.call] : 'elapsed_ms ' + JSON.stringify(ms);
    }
    assert.deepEqual(got, want, 'elapsed_ms of each CLI call');
    assert.deepEqual(Object.keys(obs.elapsed).sort(), rows.map(r => r.call).sort(), 'the tool.result events of the CLI run');
  },
  timing(obs) { assert.deepEqual(obs.timing, [], 'elapsed_ms against the event seconds and the shell waits'); },
  times(obs) { assert.deepEqual(obs.times, [], 'event times'); },
  others(obs, want) { assert.deepEqual(obs.others, want, 'fields of every other event'); },
  bodies(obs) { assert.equal(obs.mentioning, 0, 'request bodies that mention elapsed_ms'); },
  leaks(obs) { assert.deepEqual(obs.logged, [], 'paths, arguments and file texts the event stream must not carry'); },
};
// contractDocs is what docs/contract/loop-v1.md says of elapsed_ms: whether the tool.result row
// of the event table lists it, and whether a line besides the row names both it and Tools.Now.
function contractDocs(text) {
  const lines = text.split('\n');
  const rows = lines.filter(l => l.startsWith('| `tool.result` |'));
  return {row:rows.length === 1 && rows[0].includes('`elapsed_ms` (integer'),
    note:lines.some(l => !l.startsWith('|') && l.includes('`elapsed_ms`') && l.includes('`Tools.Now`'))};
}

// ---- observer controls ----

const WAIT = (spawned, endedBy) => ({spawned, wait_started:'instant', wait_ended:'instant', ended_by:endedBy});
const REFUSAL = 'refused: this command would stop processes this run did not start (rule: no pkill or killall; kill only pids this run created). Stop what you started with its own pid, for example kill $!, or its process group.';
const IMAGE = 'error: l-tre-missing.png: unreadable/nonregular artifact or invalid PNG: cannot stat artifact: enoent. Limits: static non-interlaced RGB8 PNG, 1..131072 bytes, dimensions 1..2048. Prepare/export a supported image with an ordinary external image preparation/capture tool and select it again.';
const DOCS = '{"body":"","error":"documentation source unsupported","operation":"l-tre-unsupported","query":"","sources":[],"status":"unsupported","truncated":false,"untrusted":false,"url":""}';
const AT = '2026-11-05T10:00:01.400000000Z';
// EXPECTED repeats the feature's expectations for the observer controls.
const EXPECTED = {
  cli: {
    outputs:{short:'exit status: 0\n', long:'exit status: 0\n', read:'1\t' + NOTES, write:'ok', list:'l-tre-notes.txt\nl-tre-written.txt',
      search:'l-tre-notes.txt:1:' + NOTES, image:IMAGE, docs:DOCS, refused:REFUSAL, malformed:'error: supply exactly one of command or handle', unknown:'error: unknown tool l_tre_no_such_tool'},
    tools:{callEvents:{short:{}, long:{}, read:{}, write:{}, list:{}, search:{}, image:{}, docs:{}, refused:{}, malformed:{}, unknown:{}, end:{}},
      results:{short:{elapsed_ms:'ms', exit_status:0, shell_wait:WAIT('instant', 'exit')}, long:{elapsed_ms:'ms', exit_status:0, shell_wait:WAIT('instant', 'exit')},
        read:{elapsed_ms:'ms'}, write:{elapsed_ms:'ms'}, list:{elapsed_ms:'ms'}, search:{elapsed_ms:'ms'}, image:{elapsed_ms:'ms', error_kind:'invalid_image'},
        docs:{elapsed_ms:'ms'}, refused:{elapsed_ms:'ms', rule:'pkill-killall', error_kind:'foreign_kill', shell_wait:WAIT(null, 'exit')},
        malformed:{elapsed_ms:'ms', malformed_class:'missing_argument'}, unknown:{elapsed_ms:'ms', malformed_class:'unknown_tool'}}},
    ranges:[['short', 200, 30000], ['long', 1200, 30000], ...['read', 'write', 'list', 'search', 'image', 'docs', 'refused', 'malformed', 'unknown'].map(id => [id, 0, 5000])].map(([call, from, below]) => ({call, from:String(from), below:String(below)})),
    others:{'session.started':['capabilities_digest', 'resumed', 'role', 'session_id'], 'request.started':['effort', 'model', 'n', 'owner'], 'request.attempt':['n', 'record'],
      response:['n', 'response_id', 'usage'], 'round.ended':['claim', 'ending', 'requests', 'terminal_tool', 'usage'], 'session.ended':['exit', 'status']},
  },
  harness: {
    outputs:{p200:'probe ran 200 ms', p1200:'probe ran 1200 ms', read:'1\tl-tre-clock-text', refused:REFUSAL, malformed:'error: supply exactly one of command or handle', unknown:'error: unknown tool l_tre_no_such_tool'},
    tools:{callEvents:{p200:{}, p1200:{}, read:{}, refused:{}, malformed:{}, unknown:{}, end:{}},
      results:{p200:{elapsed_ms:200}, p1200:{elapsed_ms:1200}, read:{elapsed_ms:0},
        refused:{elapsed_ms:0, rule:'pkill-killall', error_kind:'foreign_kill', shell_wait:{spawned:null, wait_started:AT, wait_ended:AT, ended_by:'exit'}},
        malformed:{elapsed_ms:0, malformed_class:'missing_argument'}, unknown:{elapsed_ms:0, malformed_class:'unknown_tool'}}},
    others:{'request.started':['effort', 'model', 'n', 'owner'], 'request.attempt':['n', 'record'], response:['n', 'response_id', 'usage'], 'round.ended':['claim', 'ending', 'requests', 'terminal_tool', 'usage']},
  },
};
// DOCS_GOOD is a contract excerpt that lists elapsed_ms as required.
const DOCS_GOOD = [
  '| `tool.call` | `call_id`, `name`, `arguments_sha256` |',
  '| `tool.result` | `call_id`, `name`, `result_sha256`, `bytes`, `cut` (bool), `elapsed_ms` (integer, every result), `rule` only for a refused shell call |',
  '',
  '`elapsed_ms` is the wall time in whole milliseconds from the moment the session starts running the call to the moment its output is complete, measured with `Tools.Now`.',
].join('\n');
const verify = (kind, obs) => {
  const want = EXPECTED[kind];
  checks.end(obs); checks.outputs(obs, want.outputs); checks.described(obs);
  if (kind === 'cli') { checks.placeheld(obs, want.tools); checks.ranges(obs, want.ranges); checks.timing(obs); }
  else { checks.seam(obs); checks.tools(obs, want.tools); }
  checks.times(obs); checks.others(obs, want.others); checks.bodies(obs); checks.leaks(obs);
};
const RUN_START = BigInt(Date.parse('2026-11-05T00:00:00Z')) * MS + 250n * MS;
const sec = n => new Date(Date.parse('2026-11-05T00:00:00Z') + n * 1000).toISOString().replace('.000Z', 'Z');
const inst = (s, ms) => new Date(Date.parse('2026-11-05T00:00:00Z') + s * 1000 + ms).toISOString().replace('Z', '000000Z');
// synthetic is a known-good raw run of the kind: the events a correct implementation emits.
function synthetic(kind) {
  const want = EXPECTED[kind];
  const outputs = Object.fromEntries(Object.entries(want.outputs));
  const names = kind === 'cli' ? Object.fromEntries(CLI_BATCHES.flat().map(([id, name]) => [id, name]))
    : {p200:'probe', p1200:'probe', read:'read_file', refused:'shell', malformed:'shell', unknown:'l_tre_no_such_tool', end:'finish'};
  const elapsed = kind === 'cli' ? {short:205, long:1207, read:0, write:1, list:4, search:3, image:0, docs:0, refused:2, malformed:0, unknown:0} : {};
  const lines = [];
  if (kind === 'cli') lines.push({type:'session.started', session_id:'s', resumed:false, role:{}, capabilities_digest:'0'.repeat(64)});
  const ids = Object.keys(want.tools.callEvents);
  ids.forEach((id, i) => {
    lines.push({type:'request.started', n:i + 1, owner:'loop', model:'m', effort:'medium'}, {type:'request.attempt', n:i + 1, record:{outcome:'completed'}},
      {type:'response', n:i + 1, response_id:null, usage:{output:3}}, {type:'tool.call', call_id:id, name:names[id], arguments_sha256:'0'.repeat(64)});
    const r = want.tools.results[id];
    if (!r) return;
    const x = {...r};
    if (kind === 'cli') {
      x.elapsed_ms = elapsed[id];
      if (x.shell_wait) x.shell_wait = {...x.shell_wait, spawned:x.shell_wait.spawned === null ? null : inst(0, 1), wait_started:inst(0, 1), wait_ended:inst(0, elapsed[id] - 1)};
    }
    lines.push({type:'tool.result', call_id:id, name:names[id], result_sha256:sha256(outputs[id]), bytes:Buffer.byteLength(outputs[id], 'utf8'), cut:false, ...x, ...(id === 'long' ? {time:sec(1)} : {})});
  });
  lines.push({type:'round.ended', ending:'terminal', terminal_tool:'finish', claim:'{"summary":"done"}', requests:3, usage:{output:9}});
  if (kind === 'cli') lines.push({type:'session.ended', status:'ended', exit:0});
  const events = lines.map((l, i) => ({protocol:'kogen-loop/v1', seq:i + 1, time:sec(0), ...l}));
  return {kind, events, outputs, bodies:['{"input":[]}'], exit:0, error:'', seam:kind === 'harness' ? 'set' : '', started:RUN_START, ended:RUN_START + 3000n * MS,
    leaks:kind === 'cli' ? ['l-tre-', 'sleep', '/tmp/l-tool-result-elapsed-x'] : ['l-tre-', '/tmp/harness-root']};
}
const onResult = (run, id, fn) => ({...run, events:run.events.map(e => (e.type === 'tool.result' && e.call_id === id ? fn({...e}) : e))});
const without = (e, k) => { delete e[k]; return e; };
// mutations are wrong runs of the kind, each of which the observer must reject.
function mutations(kind) {
  const good = synthetic(kind), out = [], want = EXPECTED[kind];
  for (const id of Object.keys(want.tools.results)) {
    out.push(['drop elapsed_ms of ' + id, onResult(good, id, e => without(e, 'elapsed_ms'))]);
    out.push(['elapsed_ms of ' + id + ' as a string', onResult(good, id, e => ({...e, elapsed_ms:String(e.elapsed_ms)}))]);
    out.push(['elapsed_ms of ' + id + ' as a fraction', onResult(good, id, e => ({...e, elapsed_ms:e.elapsed_ms + 0.5}))]);
    out.push(['elapsed_ms of ' + id + ' negative', onResult(good, id, e => ({...e, elapsed_ms:-1}))]);
    out.push(['elapsed_ms of ' + id + ' in nanoseconds', onResult(good, id, e => ({...e, elapsed_ms:(e.elapsed_ms + 1) * 1000000}))]);
    out.push(['add a field to ' + id, onResult(good, id, e => ({...e, elapsed_text:'x'}))]);
    out.push(['change the digest of ' + id, onResult(good, id, e => ({...e, result_sha256:'1'.repeat(64)}))]);
    out.push(['change the bytes of ' + id, onResult(good, id, e => ({...e, bytes:e.bytes + 1}))]);
    if (want.tools.results[id].shell_wait) out.push(['drop shell_wait of ' + id, onResult(good, id, e => without(e, 'shell_wait'))]);
    if ('exit_status' in want.tools.results[id]) out.push(['drop exit_status of ' + id, onResult(good, id, e => without(e, 'exit_status'))]);
  }
  if (kind === 'cli') {
    out.push(['short call below 200 ms', onResult(good, 'short', e => ({...e, elapsed_ms:199}))]);
    out.push(['long call below 1200 ms', onResult(good, 'long', e => ({...e, elapsed_ms:1199}))]);
    out.push(['refused call not small', onResult(good, 'refused', e => ({...e, elapsed_ms:6000}))]);
    out.push(['malformed call not small', onResult(good, 'malformed', e => ({...e, elapsed_ms:5000}))]);
    out.push(['short call beyond its event seconds', onResult(good, 'short', e => ({...e, elapsed_ms:1001}))]);
    out.push(['long call shorter than its shell wait', onResult(good, 'long', e => ({...e, elapsed_ms:200, shell_wait:{...e.shell_wait, wait_ended:inst(0, 900)}}))]);
    out.push(['shell_wait instants in another format', onResult(good, 'short', e => ({...e, shell_wait:{...e.shell_wait, wait_started:sec(0)}}))]);
  } else {
    out.push(['seam missing', {...good, seam:'tools.Tools has no field Now'}]);
    out.push(['elapsed measured from the round start', onResult(good, 'p1200', e => ({...e, elapsed_ms:1400}))]);
    out.push(['both calls given the longer time', onResult(good, 'p200', e => ({...e, elapsed_ms:1200}))]);
    out.push(['elapsed from the real clock', onResult(good, 'read', e => ({...e, elapsed_ms:1}))]);
    out.push(['shell_wait instants from the real clock', onResult(good, 'refused', e => ({...e, shell_wait:{...e.shell_wait, wait_started:inst(0, 1), wait_ended:inst(0, 1)}}))]);
    out.push(['round failed', {...good, error:'boom', exit:1}]);
  }
  out.push(['a tool.result for the terminal call', {...good, events:[...good.events, {protocol:'kogen-loop/v1', seq:99, time:sec(0), type:'tool.result', call_id:'end', name:'finish', result_sha256:null, bytes:0, cut:false, elapsed_ms:0}]}]);
  out.push(['elapsed_ms on a tool.call', {...good, events:good.events.map(e => (e.type === 'tool.call' ? {...e, elapsed_ms:0} : e))}]);
  out.push(['elapsed_ms on round.ended', {...good, events:good.events.map(e => (e.type === 'round.ended' ? {...e, elapsed_ms:0} : e))}]);
  out.push(['drop a field of request.attempt', {...good, events:good.events.map(e => (e.type === 'request.attempt' && e.n === 1 ? without({...e}, 'record') : e))}]);
  out.push(['an event time from the injected clock', {...good, events:good.events.map(e => (e.seq === 2 ? {...e, time:'2026-11-05T10:00:01Z'} : e))}]);
  out.push(['an event time with a fraction', {...good, events:good.events.map(e => (e.seq === 2 ? {...e, time:'2026-11-05T00:00:00.5Z'} : e))}]);
  out.push(['a request body mentions elapsed_ms', {...good, bodies:[...good.bodies, '{"elapsed_ms":200}']}]);
  for (const t of good.leaks) out.push(['the event stream carries ' + t, {...good, events:good.events.map(e => (e.type === 'round.ended' ? {...e, claim:'{"summary":"' + t + '/x"}'} : e))}]);
  out.push(['an error event', {...good, events:[...good.events, {protocol:'kogen-loop/v1', seq:98, time:sec(0), type:'error', class:'loop', reason:'failed', detail:'x'}]}]);
  out.push(['an output changed', {...good, outputs:{...good.outputs, read:good.outputs.read + 'x'}}]);
  out.push(['an output missing', {...good, outputs:Object.fromEntries(Object.entries(good.outputs).filter(([id]) => id !== 'read'))}]);
  return out;
}

if (require.main === module) {
  if (process.argv[2] === '--control' && process.argv[3] === 'good') {
    for (const kind of Object.keys(EXPECTED)) verify(kind, summarize(synthetic(kind)));
    assert.deepEqual(contractDocs(DOCS_GOOD), {row:true, note:true}, 'contract docs control');
    console.log('tool result elapsed observer accepted');
  } else if (process.argv[2] === '--control' && process.argv[3] === 'bad') {
    let rejected = 0;
    for (const kind of Object.keys(EXPECTED)) {
      for (const [label, run] of mutations(kind)) {
        assert.throws(() => verify(kind, summarize(run)), undefined, kind + ' must reject: ' + label);
        rejected++;
      }
    }
    for (const [label, text] of [['no elapsed_ms in the row', DOCS_GOOD.replace('`elapsed_ms` (integer, every result), ', '')],
      ['no note', DOCS_GOOD.split('\n').filter(l => !l.startsWith('`elapsed_ms` is')).join('\n')],
      ['a note without Tools.Now', DOCS_GOOD.replace('`Tools.Now`', 'a clock')]]) {
      assert.notDeepEqual(contractDocs(text), {row:true, note:true}, 'contract docs must reject: ' + label);
      rejected++;
    }
    assert.ok(rejected > 100, 'rejected mutations ' + rejected);
    console.log('tool result elapsed observer rejected'); process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  const P = 'l-tool-result-elapsed: ';
  When(P + 'I run the scripted CLI session', {timeout:300000}, async function () { this.toolResultElapsed = summarize(await runCli()); });
  When(P + 'I run the session harness on an injected clock', {timeout:300000}, function () { this.toolResultElapsed = summarize(runHarness()); });
  Then(P + 'the session ends with the finish call and no error', function () { checks.end(this.toolResultElapsed); });
  Then(P + 'the injected clock is set on the session\'s tools', function () { checks.seam(this.toolResultElapsed); });
  Then(P + 'the outputs delivered to the model are:', function (text) { checks.outputs(this.toolResultElapsed, JSON.parse(text)); });
  Then(P + 'each tool.result describes the output the model received', function () { checks.described(this.toolResultElapsed); });
  Then(P + 'the tool events add exactly:', function (text) { checks.tools(this.toolResultElapsed, JSON.parse(text)); });
  Then(P + 'the tool events add exactly, with each non-negative integer elapsed_ms as "ms" and each shell_wait instant as "instant":', function (text) { checks.placeheld(this.toolResultElapsed, JSON.parse(text)); });
  Then(P + 'the elapsed_ms of each call lies in its range:', function (table) { checks.ranges(this.toolResultElapsed, table.hashes()); });
  Then(P + 'each elapsed_ms fits within the seconds of its tool.call and tool.result events and covers its shell wait', function () { checks.timing(this.toolResultElapsed); });
  Then(P + 'every event time is a whole RFC 3339 second of the real run', function () { checks.times(this.toolResultElapsed); });
  Then(P + 'the other events carry exactly these fields:', function (text) { checks.others(this.toolResultElapsed, JSON.parse(text)); });
  Then(P + 'no request body sent to the model mentions elapsed_ms', function () { checks.bodies(this.toolResultElapsed); });
  Then(P + 'the event stream carries no path, argument or file text', function () { checks.leaks(this.toolResultElapsed); });
  Then(P + 'the contract lists elapsed_ms in the tool.result row and in a note that names Tools.Now', function () {
    assert.deepEqual(contractDocs(fs.readFileSync(path.join('docs', 'contract', 'loop-v1.md'), 'utf8')), {row:true, note:true}, 'docs/contract/loop-v1.md');
  });
}
