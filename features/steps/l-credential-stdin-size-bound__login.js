'use strict';
// Acceptance steps of l-credential-stdin-size-bound. The logins run in the Go program
// DRIVER_SOURCE below, kept as text: the steps write it to a temporary file and go run it
// through go -overlay at the virtual path features/steps/l-credential-stdin-size-bound__driver.go.
// That file does not exist and nothing is written into the checkout. The driver logs in to key
// providers through the public provider.Client with scripted inputs, each in a fresh HOME that
// already holds the key old-key, and prints one JSON object with one observation per case; the
// Gherkin owns the expectations.
// `node features/steps/l-credential-stdin-size-bound__login.js --control good|bad` runs the
// same driver against a known-good bounded reader and two known-bad ones (today's unbounded
// io.ReadAll, and a read cut at the bound that accepts the truncated input), patched into
// provider/keys.go through go -overlay.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = process.cwd();
const DRIVER = 'features/steps/l-credential-stdin-size-bound__driver.go';
const KEYS = 'provider/keys.go';
const DRIVER_SOURCE = String.raw`//go:build ignore

// Acceptance driver of l-credential-stdin-size-bound, kept as text in
// features/steps/l-credential-stdin-size-bound__login.js and run through go -overlay; this file
// does not exist in the checkout. It logs in to key providers through provider.Client with
// scripted inputs, each in a fresh HOME that already holds the key old-key, and prints one JSON
// object with one observation per case. Its only argument is the bound in bytes.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
)

// marker fills every long input; no message may carry it.
const marker = "XQZJ"

// supply is how many bytes an endless input gives before its next Read blocks for ever; it
// never reports the end of the input.
const supply = 1 << 20

var homes []string

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	for _, h := range homes {
		os.RemoveAll(h)
	}
	os.Exit(2)
}

func fill(n int) string { return strings.Repeat(marker, n/len(marker)+1)[:n] }

// source is a scripted input: data, then the end of input (eof), marker bytes up to supply
// (endless) or a Read that never returns (block). A set gate holds every Read until it is closed.
type source struct {
	data, after string
	gate        chan struct{}
	first       chan struct{}
	once        sync.Once

	mu       sync.Mutex
	consumed int
}

func newSource(data, after string) *source {
	return &source{data: data, after: after, first: make(chan struct{})}
}

func (s *source) Read(p []byte) (int, error) {
	s.once.Do(func() { close(s.first) })
	if s.gate != nil {
		<-s.gate
	}
	s.mu.Lock()
	n := 0
	switch {
	case s.consumed < len(s.data):
		n = copy(p, s.data[s.consumed:])
	case s.after == "eof":
		s.mu.Unlock()
		return 0, io.EOF
	case s.after == "endless" && s.consumed < len(s.data)+supply:
		n = min(len(p), len(s.data)+supply-s.consumed)
		for i := range n {
			p[i] = marker[(s.consumed+i)%len(marker)]
		}
	default:
		s.mu.Unlock()
		select {}
	}
	s.consumed += n
	s.mu.Unlock()
	return n, nil
}

func (s *source) count() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.consumed
}

func newHome() string {
	h, err := os.MkdirTemp("", "lcssb-")
	if err != nil {
		fail("temp: %v", err)
	}
	homes = append(homes, h)
	return h
}

func session(home string) (*sys.Session, *strings.Builder, *strings.Builder) {
	s := sys.NewWith([]string{"HOME=" + home, "PATH=" + os.Getenv("PATH")}, home)
	out, errs := &strings.Builder{}, &strings.Builder{}
	s.Stdout, s.Stderr = out, errs
	return s, out, errs
}

func client(in provider.Input) *provider.Client {
	c := provider.NewClient("kogen dev+12345678 (lcssb)")
	c.Input = &in
	return c
}

// saved describes the saved key: the key itself when it is at most 64 bytes, else its length
// and whether it is the credential the input carried.
func saved(name, home, credential string) string {
	data, err := os.ReadFile(filepath.Join(home, ".kogen", "credentials", name+".json"))
	if err != nil {
		return "unreadable"
	}
	var c map[string]any
	if json.Unmarshal(data, &c) != nil {
		return "malformed"
	}
	key, _ := c["api_key"].(string)
	switch {
	case len(key) <= 64:
		return key
	case key == credential:
		return fmt.Sprintf("the %d-byte input credential", len(key))
	default:
		return fmt.Sprintf("%d other bytes", len(key))
	}
}

// prior saves old-key for the provider through an ordinary login.
func prior(name, home string) {
	s, _, _ := session(home)
	if err := client(provider.Input{Reader: strings.NewReader("old-key\n")}).Login(context.Background(), s, name, nil); err != nil {
		fail("%s: saving old-key: %v", name, err)
	}
	if got := saved(name, home, ""); got != "old-key" {
		fail("%s: old-key was saved as %q", name, got)
	}
}

func errorOf(err error) any {
	if err == nil {
		return nil
	}
	var se *sys.Error
	if errors.As(err, &se) {
		return map[string]any{"class": se.Class, "reason": se.Reason, "exit": se.Exit, "detail": se.Detail}
	}
	return map[string]any{"text": err.Error(), "is_context_canceled": errors.Is(err, context.Canceled)}
}

// echoes is whether the error, its rendering or the session's stdout or stderr carries marker.
func echoes(err error, out, errs string) bool {
	text := out + errs
	if err != nil {
		text += err.Error()
		var se *sys.Error
		if errors.As(err, &se) {
			text += se.Render()
		}
	}
	return strings.Contains(text, marker)
}

func stty(args ...string) (string, error) {
	if len(args) > 0 && args[0] == "-g" {
		return "saved:state\n", nil
	}
	return "", nil
}

type spec struct {
	name, provider, data, after string
	terminal                    bool
}

func login(sp spec, bound int) map[string]any {
	home := newHome()
	prior(sp.provider, home)
	src := newSource(sp.data, sp.after)
	s, out, errs := session(home)
	in := provider.Input{Reader: src, Terminal: sp.terminal}
	if sp.terminal {
		in.Stty = stty
	}
	c := client(in)
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	done := make(chan error, 1)
	go func() { done <- c.Login(context.Background(), s, sp.provider, nil) }()
	select {
	case err := <-done:
		runtime.ReadMemStats(&after)
		return map[string]any{
			"returned_within_5s":        true,
			"error":                     errorOf(err),
			"saved":                     saved(sp.provider, home, strings.TrimSuffix(sp.data, "\n")),
			"stdout":                    out.String(),
			"stderr":                    errs.String(),
			"echoes_input":              echoes(err, out.String(), errs.String()),
			"consumed":                  src.count(),
			"allocated_under_64_bounds": after.TotalAlloc-before.TotalAlloc < uint64(64*bound),
		}
	case <-time.After(5 * time.Second):
		return map[string]any{"returned_within_5s": false, "consumed": src.count()}
	}
}

// cancelled starts an opencode-go login whose endless input holds its first Read, cancels the
// context, and once the login has returned lets the input supply bytes freely; it then waits
// until no byte has been read for 500 ms (at most 5 s).
func cancelled(bound int) map[string]any {
	home := newHome()
	prior("opencode-go", home)
	src := newSource("", "endless")
	src.gate = make(chan struct{})
	s, out, errs := session(home)
	c := client(provider.Input{Reader: src})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	done := make(chan error, 1)
	go func() { done <- c.Login(ctx, s, "opencode-go", nil) }()
	select {
	case <-src.first:
	case <-time.After(5 * time.Second):
		return map[string]any{"read_started": false}
	}
	cancel()
	var err error
	select {
	case err = <-done:
	case <-time.After(5 * time.Second):
		return map[string]any{"read_started": true, "returned_within_5s_of_cancel": false}
	}
	close(src.gate)
	deadline := time.Now().Add(5 * time.Second)
	for src.count() == 0 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	last, quiet := src.count(), time.Now()
	for time.Now().Before(deadline) && time.Since(quiet) < 500*time.Millisecond {
		time.Sleep(20 * time.Millisecond)
		if n := src.count(); n != last {
			last, quiet = n, time.Now()
		}
	}
	return map[string]any{
		"read_started":                 true,
		"returned_within_5s_of_cancel": true,
		"error":                        errorOf(err),
		"saved":                        saved("opencode-go", home, ""),
		"stdout":                       out.String(),
		"stderr":                       errs.String(),
		"consumed_after_cancel_at_most_bound_plus_one": last > 0 && last <= bound+1,
		"reading_stopped": time.Since(quiet) >= 500*time.Millisecond,
	}
}

func main() {
	if len(os.Args) != 2 {
		fail("usage: driver <bound>")
	}
	bound, err := strconv.Atoi(os.Args[1])
	if err != nil || bound < 2 {
		fail("bound %q", os.Args[1])
	}
	const short = "SYNTHETIC-short-key"
	specs := []spec{
		{"endless-opencode-go", "opencode-go", "", "endless", false},
		{"endless-claude-code", "claude-code", "", "endless", false},
		{"short-opencode-go", "opencode-go", short, "eof", false},
		{"short-newline-opencode-go", "opencode-go", short + "\n", "eof", false},
		{"short-claude-code", "claude-code", short, "eof", false},
		{"short-newline-claude-code", "claude-code", short + "\n", "eof", false},
		{"bound-opencode-go", "opencode-go", fill(bound), "eof", false},
		{"bound-claude-code", "claude-code", fill(bound), "eof", false},
		{"bound-minus-one-newline-opencode-go", "opencode-go", fill(bound-1) + "\n", "eof", false},
		{"terminal-long-line-opencode-go", "opencode-go", fill(2*bound) + "\n", "block", true},
		{"bound-plus-one-opencode-go", "opencode-go", fill(bound + 1), "eof", false},
		{"bound-plus-one-anthropic", "anthropic", fill(bound + 1), "eof", false},
		{"bound-plus-one-claude-code", "claude-code", fill(bound + 1), "eof", false},
		{"bound-newline-opencode-go", "opencode-go", fill(bound) + "\n", "eof", false},
	}
	obs := map[string]any{}
	for _, sp := range specs {
		obs[sp.name] = login(sp, bound)
	}
	obs["cancelled-opencode-go"] = cancelled(bound)
	data, err := json.Marshal(obs)
	if err != nil {
		fail("json: %v", err)
	}
	for _, h := range homes {
		os.RemoveAll(h)
	}
	fmt.Println(string(data))
}
`;
const CASES = ['endless-opencode-go', 'endless-claude-code', 'short-opencode-go', 'short-newline-opencode-go', 'short-claude-code',
  'short-newline-claude-code', 'bound-opencode-go', 'bound-claude-code', 'bound-minus-one-newline-opencode-go',
  'terminal-long-line-opencode-go', 'bound-plus-one-opencode-go', 'bound-plus-one-anthropic', 'bound-plus-one-claude-code',
  'bound-newline-opencode-go', 'cancelled-opencode-go'];

// EXPECTED repeats the feature's expectations for the observer controls.
const KEY = 'invalid OpenCode Go key input; saved login unchanged';
const TOKEN = 'invalid Claude Code token input: the token must be one line of letters, digits, dot, underscore and hyphen only; saved login unchanged';
const refused = (reason, detail) => ({returned_within_5s: true, error: {class: 'provider', reason, exit: 4, detail}, saved: 'old-key', stdout: '', stderr: '', echoes_input: false, consumed: 16385});
const accepted = (stdout, saved) => ({returned_within_5s: true, error: null, saved, stdout, stderr: '', echoes_input: false});
const KEY_SAVED = 'opencode-go: key saved (not verified)\n';
const TOKEN_SAVED = 'claude-code: token saved (not verified)\n';
const EXPECTED = {
  'endless-opencode-go': {...refused('login_failed', KEY), allocated_under_64_bounds: true},
  'endless-claude-code': {...refused('login_failed', TOKEN), allocated_under_64_bounds: true},
  'short-opencode-go': accepted(KEY_SAVED, 'SYNTHETIC-short-key'),
  'short-newline-opencode-go': accepted(KEY_SAVED, 'SYNTHETIC-short-key'),
  'short-claude-code': accepted(TOKEN_SAVED, 'SYNTHETIC-short-key'),
  'short-newline-claude-code': accepted(TOKEN_SAVED, 'SYNTHETIC-short-key'),
  'bound-opencode-go': accepted(KEY_SAVED, 'the 16384-byte input credential'),
  'bound-claude-code': accepted(TOKEN_SAVED, 'the 16384-byte input credential'),
  'bound-minus-one-newline-opencode-go': accepted(KEY_SAVED, 'the 16383-byte input credential'),
  'terminal-long-line-opencode-go': accepted(KEY_SAVED, 'the 32768-byte input credential'),
  'bound-plus-one-opencode-go': refused('login_failed', KEY),
  'bound-plus-one-anthropic': refused('login', 'invalid Anthropic key input; saved login unchanged'),
  'bound-plus-one-claude-code': refused('login_failed', TOKEN),
  'bound-newline-opencode-go': refused('login_failed', KEY),
  'cancelled-opencode-go': {read_started: true, returned_within_5s_of_cancel: true, error: {text: 'context canceled', is_context_canceled: true},
    saved: 'old-key', stdout: '', stderr: '', consumed_after_cancel_at_most_bound_plus_one: true, reading_stopped: true},
};
const WITHIN = ['short-opencode-go', 'short-newline-opencode-go', 'short-claude-code', 'short-newline-claude-code', 'bound-opencode-go',
  'bound-claude-code', 'bound-minus-one-newline-opencode-go', 'terminal-long-line-opencode-go'];
const PAST = ['endless-opencode-go', 'endless-claude-code', 'bound-plus-one-opencode-go', 'bound-plus-one-anthropic', 'bound-plus-one-claude-code',
  'bound-newline-opencode-go'];

const owned = [];
function temp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'l-credential-stdin-size-bound-')); fs.chmodSync(d, 0o700); owned.push(d); return d; }
function cleanup() { for (const d of owned) fs.rmSync(d, {recursive: true, force: true}); owned.length = 0; }
// Keep the caller's HOME and PATH: toolchain shims (mise) resolve go through them. PWD is the
// root so that go resolves the overlay's absolute paths as they are written.
function goEnv() { return {...process.env, PWD: root, LC_ALL: 'C', GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off'}; }

// The controls' readers, patched into provider/keys.go. GOOD reads at most bound + 1 bytes and
// refuses more than the bound as an invalid key or token; TRUNCATING reads at most the bound
// and accepts what it read.
const UNBOUNDED = '\t\t\tdata, err = io.ReadAll(in.Reader)\n';
const RESULT = '\t\treturn string(r.data), (r.err == nil || r.err == io.EOF) && utf8.Valid(r.data), nil\n';
const KEY_LINE = '\t// One terminating line ending goes; any other line break is not a key.\n';
const TOKEN_LINE = '\ttoken := strings.TrimFunc(value, unicode.IsSpace)\n';
function patch(s, from, to) {
  assert.ok(s.includes(from), KEYS + ' has no ' + JSON.stringify(from));
  return s.replace(from, to);
}
function keysVariant(variant) {
  let s = fs.readFileSync(path.join(root, KEYS), 'utf8');
  if (variant === 'today') return patch(s, UNBOUNDED, UNBOUNDED);
  if (variant === 'truncating') return patch(s, UNBOUNDED, '\t\t\tdata, err = io.ReadAll(io.LimitReader(in.Reader, lcssbBound))\n') + '\nconst lcssbBound = 16384\n';
  s = patch(s, UNBOUNDED, '\t\t\tdata, err = io.ReadAll(io.LimitReader(in.Reader, lcssbBound+1))\n');
  s = patch(s, RESULT, '\t\treturn string(r.data), (r.err == nil || r.err == io.EOF) && (utf8.Valid(r.data) || !in.Terminal && len(r.data) > lcssbBound), nil\n');
  s = patch(s, KEY_LINE, '\tif !in.Terminal && len(value) > lcssbBound {\n\t\treturn fail("invalid " + p.Label + " key input; saved login unchanged")\n\t}\n' + KEY_LINE);
  s = patch(s, TOKEN_LINE, '\tif !in.Terminal && len(value) > lcssbBound {\n\t\treturn fail("invalid Claude Code token input: the token must be one line of letters, digits, dot, underscore and hyphen only")\n\t}\n' + TOKEN_LINE);
  return s + '\nconst lcssbBound = 16384\n';
}

function execute(variant, bound) {
  const d = temp();
  fs.writeFileSync(path.join(d, 'driver.go'), DRIVER_SOURCE, {mode: 0o600});
  const replace = {[path.join(root, DRIVER)]: path.join(d, 'driver.go')};
  if (variant) {
    fs.writeFileSync(path.join(d, 'keys.go'), keysVariant(variant), {mode: 0o600});
    replace[path.join(root, KEYS)] = path.join(d, 'keys.go');
  }
  fs.writeFileSync(path.join(d, 'overlay.json'), JSON.stringify({Replace: replace}), {mode: 0o600});
  const args = ['run', '-overlay', path.join(d, 'overlay.json'), DRIVER, String(bound)];
  const r = spawnSync('go', args, {cwd: root, env: goEnv(), encoding: 'utf8', timeout: 240000, maxBuffer: 32 * 1024 * 1024});
  return {command: 'go ' + args.join(' '), status: r.status, signal: r.signal, error: r.error ? r.error.message : null, stdout: r.stdout || '', stderr: r.stderr || ''};
}

// report checks that the driver ran cleanly and returns its observations.
function report(r) {
  const why = 'credential input driver: `' + r.command + '` exited ' + r.status + (r.signal ? ' (' + r.signal + ')' : '') + '\n' + r.stdout + r.stderr;
  assert.equal(r.error, null, 'process.error ' + why);
  assert.equal(r.signal, null, 'process.signal ' + why);
  assert.equal(r.status, 0, 'process.status ' + why);
  assert.equal(r.stderr, '', 'process.stderr ' + why);
  const lines = r.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, 'one JSON line ' + why);
  const obs = JSON.parse(lines[0]);
  assert.deepEqual(Object.keys(obs).sort(), [...CASES].sort(), 'the driver observed every case ' + why);
  return obs;
}
function include(obs, name, want) {
  const got = obs[name] === undefined ? undefined : Object.fromEntries(Object.keys(want).map(k => [k, obs[name][k]]));
  assert.deepEqual(got, want, 'case ' + name + ' of the credential input driver observed ' + JSON.stringify(obs[name]));
}
function verify(obs, names) { for (const n of names) include(obs, n, EXPECTED[n]); }

function control(kind) {
  if (kind === 'good') {
    verify(report(execute('good', 16384)), CASES);
    process.stdout.write('l-credential-stdin-size-bound observer good\n');
    return;
  }
  const reject = (what, fn) => { let caught; try { fn(); } catch (e) { caught = e; } assert.ok(caught, 'negative missed assertion: ' + what); };
  // Today's unbounded read keeps every read within the bound as it is, never ends on an
  // endless input, accepts past the bound and keeps reading after cancellation.
  const today = report(execute('today', 16384));
  verify(today, WITHIN);
  for (const n of [...PAST, 'cancelled-opencode-go']) reject('today ' + n, () => verify(today, [n]));
  // A read cut at the bound stops after cancellation but accepts the truncated input.
  const cut = report(execute('truncating', 16384));
  verify(cut, [...WITHIN, 'cancelled-opencode-go']);
  for (const n of PAST) reject('truncating ' + n, () => verify(cut, [n]));
  // The judges reject wrong observations and broken runs on their own.
  const good = Object.fromEntries(CASES.map(n => [n, {...EXPECTED[n]}]));
  verify(good, CASES);
  for (const [what, name, change] of [
    ['echoed', 'bound-plus-one-opencode-go', {echoes_input: true}],
    ['other detail', 'bound-plus-one-anthropic', {error: {class: 'provider', reason: 'login', exit: 4, detail: 'Anthropic input interrupted; saved login unchanged'}}],
    ['over-read', 'endless-claude-code', {consumed: 16386}],
    ['memory', 'endless-opencode-go', {allocated_under_64_bounds: false}],
    ['stderr', 'bound-newline-opencode-go', {stderr: 'XQZJ\n'}],
    ['replaced', 'bound-plus-one-claude-code', {saved: 'the 16385-byte input credential'}],
    ['terminal bounded', 'terminal-long-line-opencode-go', {error: {class: 'provider', reason: 'login_failed', exit: 4, detail: KEY}, saved: 'old-key', stdout: ''}],
    ['newline lost', 'short-newline-claude-code', {saved: 'SYNTHETIC-short-key\n'}],
    ['other error', 'cancelled-opencode-go', {error: {text: 'context deadline exceeded', is_context_canceled: false}}],
    ['kept reading', 'cancelled-opencode-go', {reading_stopped: false}],
  ]) reject(what, () => verify({...good, [name]: {...good[name], ...change}}, CASES));
  const run = {command: 'synthetic', status: 0, signal: null, error: null, stdout: JSON.stringify(good) + '\n', stderr: ''};
  verify(report(run), CASES);
  const partial = {...good};
  delete partial['cancelled-opencode-go'];
  for (const [what, change] of [['status', {status: 1}], ['signal', {signal: 'SIGKILL'}], ['error', {error: 'watchdog'}],
    ['stderr', {stderr: 'undefined: lcssbBound\n'}], ['stdout', {stdout: ''}], ['two lines', {stdout: run.stdout + run.stdout}],
    ['missing case', {stdout: JSON.stringify(partial) + '\n'}]]) {
    reject(what, () => report({...run, ...change}));
  }
  process.stdout.write('l-credential-stdin-size-bound observer bad rejected\n');
  process.exitCode = 1;
}

if (require.main === module) {
  try { assert.equal(process.argv[2], '--control'); assert.ok(['good', 'bad'].includes(process.argv[3])); control(process.argv[3]); }
  catch (e) { console.error(e.stack); process.exitCode = 2; } finally { cleanup(); }
} else {
  const {When, Then, AfterAll} = require('@cucumber/cucumber');
  const runs = new Map();
  When('l-credential-stdin-size-bound: I log in to the key providers with the scripted inputs under a bound of {int} bytes', {timeout: 300000}, function (bound) {
    if (!runs.has(bound)) runs.set(bound, report(execute(null, bound)));
    this.lcssb = runs.get(bound);
  });
  Then('l-credential-stdin-size-bound: the case {string} observed:', function (name, doc) {
    include(this.lcssb, name, JSON.parse(doc));
  });
  AfterAll(cleanup);
}
