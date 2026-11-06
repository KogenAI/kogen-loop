'use strict';
// Acceptance steps of k-loop-token-login-empty-input-names-stdin. This repository has no
// `kogen provider login` command of its own, so the steps build a stand-in for it from
// DRIVER_SOURCE below, kept as text: it is written to a temporary file and built through
// go -overlay at the virtual path features/steps/k-loop-token-login-empty-input-names-stdin__driver.go,
// which does not exist; nothing is written into the checkout. The binary is named `kogen` and put
// first on PATH, so a scenario runs its command line as written (`kogen provider login anthropic
// < /dev/null`) through /bin/sh, in a fresh HOME and a scratch working directory. The stand-in
// signs in through the public provider.Client.Login with the process's own standard input,
// HOME and signals, writes a refusal's rendered line to stderr and exits with its code. The
// terminal scenario runs the command under script(1) so that standard input is a pseudo
// terminal, and sends SIGINT to the stand-in while it waits. The Gherkin owns the expectations.
// `node features/steps/k-loop-token-login-empty-input-names-stdin__login.js --control good|bad`
// runs the same cases against builds of provider/keys.go patched through go -overlay: good
// reads /dev/null as non-terminal input and refuses zero bytes with the new text, and must pass
// every case; bad runs today's file and two half fixes, each of which must fail exactly the
// cases named in VARIANTS.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');

const P = 'k-loop-token-login-empty-input-names-stdin';
const root = process.cwd();
const DRIVER = 'features/steps/' + P + '__driver.go';
const KEYS = 'provider/keys.go';
const DRIVER_SOURCE = String.raw`//go:build ignore

// Acceptance stand-in for kogen provider login <name>, kept as text in
// features/steps/k-loop-token-login-empty-input-names-stdin__login.js and built through
// go -overlay; this file does not exist in the checkout. It signs in through the public
// provider.Client.Login with this process's standard input, HOME and signals.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/KogenAI/kogen-loop/provider"
	"github.com/KogenAI/kogen-loop/sys"
)

func main() {
	if len(os.Args) != 4 || os.Args[1] != "provider" || os.Args[2] != "login" {
		fmt.Fprintln(os.Stderr, "usage: kogen provider login <name>")
		os.Exit(2)
	}
	s := sys.New()
	stop := s.WatchSignals()
	// Under script(1) the pseudo terminal first carries the end of script's own empty input;
	// take it so that the login then waits on the terminal.
	if os.Getenv("KLTL_TERMINAL_EOF") == "1" {
		got := make(chan struct{})
		go func() { os.Stdin.Read(make([]byte, 64)); close(got) }()
		select {
		case <-got:
		case <-time.After(3 * time.Second):
		}
	}
	if f := os.Getenv("KLTL_PID_FILE"); f != "" {
		if err := os.WriteFile(f+".tmp", []byte(fmt.Sprint(os.Getpid())), 0o600); err != nil {
			fmt.Fprintln(os.Stderr, "pid file:", err)
			os.Exit(2)
		}
		if err := os.Rename(f+".tmp", f); err != nil {
			fmt.Fprintln(os.Stderr, "pid file:", err)
			os.Exit(2)
		}
	}
	err := provider.NewClient("kogen-acceptance").Login(context.Background(), s, os.Args[3], nil)
	stop()
	var se *sys.Error
	var in *sys.Interrupted
	switch {
	case err == nil:
		os.Exit(0)
	case errors.As(err, &se):
		fmt.Fprint(os.Stderr, se.Render())
		os.Exit(se.Exit)
	case errors.As(err, &in):
		fmt.Fprintln(os.Stderr, in.Error())
		os.Exit(in.ExitCode())
	default:
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
`;

const owned = [];
function temp(tag) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kltl-' + tag + '-'));
  fs.chmodSync(d, 0o700);
  owned.push(d);
  return d;
}
function cleanup() { for (const d of owned) fs.rmSync(d, {recursive: true, force: true}); owned.length = 0; }
// Keep the caller's HOME and PATH for go: toolchain shims (mise) resolve go through them. PWD is
// the root so that go resolves the overlay's absolute paths as they are written.
function goEnv() { return {...process.env, PWD: root, LC_ALL: 'C', GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off'}; }

// The controls' variants of provider/keys.go. TERMINAL makes StdinInput call standard input a
// terminal only when stty can read its settings; NONE refuses a read that ended with zero bytes
// with the new text.
const TERMINAL_LINE = '\t\tTerminal: err == nil && info.Mode()&os.ModeCharDevice != 0,\n';
const KEY_LINE = '\t// One terminating line ending goes; any other line break is not a key.\n';
const TOKEN_LINE = '\ttoken := strings.TrimFunc(value, unicode.IsSpace)\n';
function patch(s, from, to) {
  assert.ok(s.includes(from), KEYS + ' has no ' + JSON.stringify(from));
  return s.replace(from, to);
}
function keysVariant(variant) {
  let s = fs.readFileSync(path.join(root, KEYS), 'utf8');
  if (variant === 'good' || variant === 'terminal-only') {
    s = patch(s, TERMINAL_LINE, '\t\tTerminal: err == nil && info.Mode()&os.ModeCharDevice != 0 && kltlTerminal(),\n');
    s += '\nfunc kltlTerminal() bool {\n\tcmd := exec.Command("stty", "-g")\n\tcmd.Stdin = os.Stdin\n\treturn cmd.Run() == nil\n}\n';
  }
  if (variant === 'good' || variant === 'message-only') {
    s = patch(s, KEY_LINE, `\tif value == "" {\n\t\treturn fail("no " + p.Label + " key input was read from standard input; pipe the key: printf '%s' \\"$KEY\\" | kogen provider login " + p.Name + "; saved login unchanged")\n\t}\n` + KEY_LINE);
    s = patch(s, TOKEN_LINE, `\tif value == "" {\n\t\treturn fail("no Claude Code token input was read from standard input; pipe the token: printf '%s' \\"$TOKEN\\" | kogen provider login claude-code")\n\t}\n` + TOKEN_LINE);
  }
  return s;
}

const builds = new Map();
// build returns the directory holding the stand-in `kogen`, built from this checkout (variant
// null) or from a patched provider/keys.go.
function build(variant) {
  if (builds.has(variant)) return builds.get(variant);
  const d = temp('build');
  fs.writeFileSync(path.join(d, 'driver.go'), DRIVER_SOURCE, {mode: 0o600});
  const replace = {[path.join(root, DRIVER)]: path.join(d, 'driver.go')};
  if (variant) {
    fs.writeFileSync(path.join(d, 'keys.go'), keysVariant(variant), {mode: 0o600});
    replace[path.join(root, KEYS)] = path.join(d, 'keys.go');
  }
  fs.writeFileSync(path.join(d, 'overlay.json'), JSON.stringify({Replace: replace}), {mode: 0o600});
  const bin = path.join(d, 'bin');
  fs.mkdirSync(bin);
  const args = ['build', '-overlay', path.join(d, 'overlay.json'), '-o', path.join(bin, 'kogen'), DRIVER];
  const r = spawnSync('go', args, {cwd: root, env: goEnv(), encoding: 'utf8', timeout: 240000});
  assert.ok(r.status === 0 && !r.error, 'building the kogen login stand-in: `go ' + args.join(' ') + '` exited ' + r.status +
    (r.error ? ' (' + r.error.message + ')' : '') + '\n' + (r.stdout || '') + (r.stderr || ''));
  builds.set(variant, bin);
  return bin;
}

function loginEnv(bin, home) {
  const env = {...process.env, HOME: home, PATH: bin + path.delimiter + (process.env.PATH || '/usr/bin:/bin'), LC_ALL: 'C'};
  for (const k of ['KOGEN_PROVIDER_URL', 'KOGEN_AUTH_URL', 'KLTL_TERMINAL_EOF', 'KLTL_PID_FILE']) delete env[k];
  return env;
}

// runShell runs one command line through /bin/sh; its output is stdout followed by stderr.
function runShell(bin, home, work, command) {
  const r = spawnSync('/bin/sh', ['-c', command], {cwd: work, env: loginEnv(bin, home), encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe']});
  const stdout = r.stdout || '', stderr = r.stderr || '';
  return {command, status: r.status, signal: r.signal, error: r.error ? r.error.message : null, stdout, stderr, output: stdout + stderr};
}

// runTerminal runs the command under script(1), whose pseudo terminal is the command's standard
// input, stdout and stderr, and sends SIGINT to the stand-in 500 ms after it reported its pid.
function runTerminal(bin, home, work, command) {
  const d = temp('tty');
  const pidFile = path.join(d, 'pid'), outFile = path.join(d, 'out');
  const args = process.platform === 'darwin' ? ['-q', '/dev/null', '/bin/sh', '-c', command] : ['-qec', command, '/dev/null'];
  const env = {...loginEnv(bin, home), KLTL_TERMINAL_EOF: '1', KLTL_PID_FILE: pidFile};
  const inFd = fs.openSync('/dev/null', 'r'), outFd = fs.openSync(outFile, 'w');
  return new Promise(resolve => {
    let sent = null, timedOut = false, spawnError = null, kill = null;
    const child = spawn('script', args, {cwd: work, env, stdio: [inFd, outFd, outFd]});
    fs.closeSync(inFd);
    fs.closeSync(outFd);
    const guard = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 30000);
    const poll = setInterval(() => {
      let text = '';
      try { text = fs.readFileSync(pidFile, 'utf8'); } catch {}
      if (!/^[1-9][0-9]*$/.test(text) || Number(text) <= 1) return;
      clearInterval(poll);
      kill = setTimeout(() => {
        try { process.kill(Number(text), 'SIGINT'); sent = 'SIGINT'; } catch (e) { sent = 'not sent: ' + e.message; }
      }, 500);
    }, 20);
    child.on('error', e => { spawnError = e.message; });
    child.on('close', (status, signal) => {
      clearTimeout(guard);
      clearInterval(poll);
      if (kill) clearTimeout(kill);
      const output = fs.readFileSync(outFile, 'utf8');
      resolve({command: 'script ' + args.join(' '), status, signal, error: spawnError || (timedOut ? 'did not end within 30 s' : null),
        stdout: output, stderr: '', output, sent});
    });
  });
}

function describe(r) {
  return '`' + r.command + '` exited ' + r.status + (r.signal ? ' (signal ' + r.signal + ')' : '') + (r.error ? ' (' + r.error + ')' : '') +
    (r.sent !== undefined ? ', SIGINT ' + (r.sent || 'not sent: the login ended first') : '') + '\n--- output ---\n' + r.output + '--- end ---';
}
function credFile(home, provider) { return path.join(home, '.kogen', 'credentials', provider + '.json'); }

// signIn saves key for provider in home through the stand-in, from a file, and returns the
// saved credential's bytes. A failure here is a broken fixture, never a case result.
function signIn(bin, home, provider, key) {
  const d = temp('old');
  fs.writeFileSync(path.join(d, 'old-credential.txt'), key + '\n', {mode: 0o600});
  const r = runShell(bin, home, d, 'kogen provider login ' + provider + ' < old-credential.txt');
  try {
    assert.equal(r.status, 0, 'signing in ' + provider + ' with ' + key + ' before the scenario: ' + describe(r));
    return fs.readFileSync(credFile(home, provider));
  } catch (e) { e.fixture = true; throw e; }
}

// The observer's checks, shared by the steps and the controls.
function delivered(r) {
  assert.ok(r.error === null && r.sent === 'SIGINT', 'the login on a terminal was still waiting when SIGINT was sent: ' + describe(r));
}
function exitIs(r, code) { assert.ok(r.error === null && r.status === code, 'exit code ' + code + ' expected: ' + describe(r)); }
function outputIs(r, text) { assert.equal(r.output, text, 'the output of ' + describe(r)); }
function outputHas(r, text) { assert.ok(r.output.includes(text), 'the output contains ' + JSON.stringify(text) + ': ' + describe(r)); }
function outputLacks(r, text) { assert.ok(!r.output.includes(text), 'the output does not contain ' + JSON.stringify(text) + ': ' + describe(r)); }
function savedUnchanged(home, provider, before) {
  let after = null;
  try { after = fs.readFileSync(credFile(home, provider)); } catch {}
  assert.ok(after !== null && after.equals(before), 'the saved ' + provider + ' login keeps its bytes ' + JSON.stringify(before.toString()) +
    ', now ' + JSON.stringify(after === null ? null : after.toString()));
}
function savedHolds(home, provider, key) {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(credFile(home, provider), 'utf8')); } catch {}
  assert.deepEqual(saved, {provider, api_key: key}, 'the saved ' + provider + ' login');
}

// CASES repeat the feature's expectations for the observer controls.
const NONE = {
  anthropic: `provider/login: no Anthropic key input was read from standard input; pipe the key: printf '%s' "$KEY" | kogen provider login anthropic; saved login unchanged`,
  'opencode-go': `provider/login_failed: no OpenCode Go key input was read from standard input; pipe the key: printf '%s' "$KEY" | kogen provider login opencode-go; saved login unchanged`,
  'claude-code': `provider/login_failed: no Claude Code token input was read from standard input; pipe the token: printf '%s' "$TOKEN" | kogen provider login claude-code; saved login unchanged`,
};
const OLD = {anthropic: 'SYNTHETIC-old-key', 'opencode-go': 'SYNTHETIC-old-key', 'claude-code': 'SYNTHETIC-old-token'};
const none = (id, provider, command) => ({id, provider, command, exit: 4, output: NONE[provider], has: ['standard input'], lacks: ['interrupted'], unchanged: true});
const CASES = [
  none('dev-null-anthropic', 'anthropic', 'kogen provider login anthropic < /dev/null'),
  none('dev-null-claude-code', 'claude-code', 'kogen provider login claude-code < /dev/null'),
  none('dev-null-opencode-go', 'opencode-go', 'kogen provider login opencode-go < /dev/null'),
  none('closed-opencode-go', 'opencode-go', 'kogen provider login opencode-go <&-'),
  none('empty-pipe-anthropic', 'anthropic', "printf '' | kogen provider login anthropic"),
  none('empty-pipe-claude-code', 'claude-code', "printf '' | kogen provider login claude-code"),
  {id: 'blank-line-anthropic', provider: 'anthropic', command: "printf '\\n' | kogen provider login anthropic", exit: 4,
    output: 'provider/login: no Anthropic key supplied; saved login unchanged', unchanged: true},
  {id: 'sigint-terminal-anthropic', provider: 'anthropic', terminal: true, command: 'kogen provider login anthropic', exit: 130,
    has: ['interrupted by SIGINT'], lacks: ['standard input'], unchanged: true},
  {id: 'invalid-anthropic', provider: 'anthropic', files: {'two-lines.txt': 'first-line\nsecond-line'}, command: 'kogen provider login anthropic < two-lines.txt',
    exit: 4, output: 'provider/login: invalid Anthropic key input; saved login unchanged', lacks: ['first-line', 'second-line'], unchanged: true},
  {id: 'invalid-claude-code', provider: 'claude-code', files: {'token.txt': 'not a token'}, command: 'kogen provider login claude-code < token.txt', exit: 4,
    output: 'provider/login_failed: invalid Claude Code token input: the token must be one line of letters, digits, dot, underscore and hyphen only; saved login unchanged',
    lacks: ['not a token'], unchanged: true},
  {id: 'valid-anthropic', provider: 'anthropic', files: {'anthropic-key.txt': 'SYNTHETIC-new-key-0123'}, command: 'kogen provider login anthropic < anthropic-key.txt',
    exit: 0, output: 'anthropic: key saved (not verified)', lacks: ['SYNTHETIC-new-key-0123'], holds: 'SYNTHETIC-new-key-0123'},
  {id: 'valid-claude-code', provider: 'claude-code', files: {'claude-token.txt': 'SYNTHETIC-new-token-0123'}, command: 'kogen provider login claude-code < claude-token.txt',
    exit: 0, output: 'claude-code: token saved (not verified)', lacks: ['SYNTHETIC-new-token-0123'], holds: 'SYNTHETIC-new-token-0123'},
];
const ZERO = ['dev-null-anthropic', 'dev-null-claude-code', 'dev-null-opencode-go', 'closed-opencode-go', 'empty-pipe-anthropic', 'empty-pipe-claude-code'];
// VARIANTS name the cases each known-bad keys.go must fail; every other case must pass.
const VARIANTS = [
  [null, ZERO],
  ['message-only', ['dev-null-anthropic', 'dev-null-claude-code', 'dev-null-opencode-go', 'closed-opencode-go']],
  ['terminal-only', ZERO],
];

async function runCase(bin, c) {
  const home = temp('home'), work = temp('work');
  const before = signIn(bin, home, c.provider, OLD[c.provider]);
  for (const [name, text] of Object.entries(c.files || {})) fs.writeFileSync(path.join(work, name), text + '\n', {mode: 0o600});
  const r = c.terminal ? await runTerminal(bin, home, work, c.command) : runShell(bin, home, work, c.command);
  if (c.terminal) delivered(r);
  exitIs(r, c.exit);
  if (c.output !== undefined) outputIs(r, c.output + '\n');
  for (const s of c.has || []) outputHas(r, s);
  for (const s of c.lacks || []) outputLacks(r, s);
  if (c.unchanged) savedUnchanged(home, c.provider, before);
  if (c.holds) savedHolds(home, c.provider, c.holds);
}
async function failures(bin) {
  const failed = [];
  for (const c of CASES) {
    try { await runCase(bin, c); } catch (e) { if (e.fixture) throw e; failed.push(c.id); }
  }
  return failed;
}

async function control(kind) {
  if (kind === 'good') {
    const bin = build('good');
    for (const c of CASES) await runCase(bin, c);
    process.stdout.write(P + ' observer good\n');
    return;
  }
  for (const [variant, expected] of VARIANTS) {
    assert.deepEqual(await failures(build(variant)), expected, 'the cases failed by keys.go ' + (variant || 'today'));
  }
  // The checks reject wrong observations on their own.
  const reject = (what, fn) => { let caught; try { fn(); } catch (e) { caught = e; } assert.ok(caught, 'negative missed assertion: ' + what); };
  const r = {command: 'synthetic', status: 4, signal: null, error: null, stdout: '', stderr: 'x interrupted\n', output: 'x interrupted\n', sent: null};
  reject('exit', () => exitIs(r, 130));
  reject('error', () => exitIs({...r, error: 'did not end within 30 s'}, 4));
  reject('lacks', () => outputLacks(r, 'interrupted'));
  reject('has', () => outputHas(r, 'standard input'));
  reject('exact', () => outputIs(r, 'x interrupted'));
  reject('not delivered', () => delivered(r));
  const home = temp('home');
  fs.mkdirSync(path.dirname(credFile(home, 'anthropic')), {recursive: true});
  fs.writeFileSync(credFile(home, 'anthropic'), '{"api_key":"SYNTHETIC-new","provider":"anthropic"}');
  reject('changed', () => savedUnchanged(home, 'anthropic', Buffer.from('{"api_key":"SYNTHETIC-old-key","provider":"anthropic"}')));
  reject('holds', () => savedHolds(home, 'anthropic', 'SYNTHETIC-old-key'));
  reject('missing', () => savedUnchanged(temp('home'), 'anthropic', Buffer.from('{}')));
  process.stdout.write(P + ' observer bad rejected\n');
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
  Given(P + ': the kogen login command built from this checkout', {timeout: 300000}, function () {
    this.kltlBin = build(null);
  });
  Given(P + ': a HOME where {string} is signed in with the key {string}', {timeout: 60000}, function (provider, key) {
    this.kltlHome = temp('home');
    this.kltlWork = temp('work');
    this.kltlSaved = {provider, bytes: signIn(this.kltlBin, this.kltlHome, provider, key)};
  });
  Given(P + ': a file {string} containing:', function (name, doc) {
    fs.writeFileSync(path.join(this.kltlWork, name), doc + '\n', {mode: 0o600});
  });
  When(P + ': I run {string}', {timeout: 60000}, function (command) {
    this.kltlRun = runShell(this.kltlBin, this.kltlHome, this.kltlWork, command);
  });
  When(P + ': I run {string} on a terminal and send SIGINT while it waits for input', {timeout: 60000}, async function (command) {
    this.kltlRun = await runTerminal(this.kltlBin, this.kltlHome, this.kltlWork, command);
    delivered(this.kltlRun);
  });
  Then(P + ': the exit code is {int}', function (code) { exitIs(this.kltlRun, code); });
  Then(P + ': the output is exactly:', function (doc) { outputIs(this.kltlRun, doc + '\n'); });
  Then(P + ': the output contains {string}', function (text) { outputHas(this.kltlRun, text); });
  Then(P + ': the output does not contain {string}', function (text) { outputLacks(this.kltlRun, text); });
  Then(P + ': the saved {string} login is unchanged', function (provider) {
    assert.equal(provider, this.kltlSaved.provider, 'the scenario signed in ' + this.kltlSaved.provider);
    savedUnchanged(this.kltlHome, provider, this.kltlSaved.bytes);
  });
  Then(P + ': the saved {string} login holds the key {string}', function (provider, key) { savedHolds(this.kltlHome, provider, key); });
  AfterAll(cleanup);
}
