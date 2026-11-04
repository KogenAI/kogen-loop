'use strict';
// Acceptance steps of l-terminate-prompt-exit-latency. Each stop case runs the Go collector
// DRIVER_SOURCE below (go run through go -overlay from a temporary file; nothing is written
// into the checkout), which stops process groups through the public sys API and prints one JSON object: what it
// observed and each stop's duration in ms. The Gherkin owns the expectations.
// `node features/steps/l-terminate-prompt-exit-latency__stop.js --control good|bad` runs the
// same collector against a known-good and the known-bad (old, fixed-step) Terminate and
// sweepGroup patched into sys/sys.go through go -overlay.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = process.cwd();
// DRIVER is the virtual path, inside the module, at which the overlay serves DRIVER_SOURCE.
const DRIVER = 'features/steps/l-terminate-prompt-exit-latency__driver.go';
const DRIVER_SOURCE = String.raw`//go:build ignore

// Acceptance collector of l-terminate-prompt-exit-latency, kept as text in
// l-terminate-prompt-exit-latency__stop.js. It runs one stop case through the
// public sys API (sys.Terminate, or Session.Run without the supervisor, the library default)
// and prints one JSON object with what it observed: the leaders' ends, the live members left
// when the stop returned and each stop's duration. The JS observer and the Gherkin own the
// expectations. It is not part of the product module.
//
// The steps write it to a temporary file and go run it through an overlay as
// features/steps/l-terminate-prompt-exit-latency__driver.go <case>; the file does not exist.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

const (
	// Every member ends on SIGTERM at once.
	promptScript = "sleep 30 >/dev/null & sleep 30 >/dev/null & echo ready; wait"
	// The shell ends about 150 ms after SIGTERM; it has no other member.
	delayedScript = "trap 'sleep 0.15; exit 0' TERM; echo ready; while :; do :; done"
	// Every member ignores SIGTERM.
	ignoreScript = "trap '' TERM; sleep 30 >/dev/null & echo ready; wait"
	// The leader ends on SIGTERM; its child ignores it.
	ignoreMemberScript = "(trap '' TERM; echo ready; exec sleep 30 >/dev/null) & wait"
)

var cleanups []func()

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	for _, c := range cleanups {
		c()
	}
	os.Exit(2)
}

// liveMembers counts the members of group pgid in one ps listing that can still run:
// zombies (Z), dead (X) and exiting (E) processes do not count.
func liveMembers(pgid int) int {
	out, err := exec.Command("ps", "-A", "-o", "pid=,pgid=,stat=").Output()
	if err != nil {
		fail("ps: %v", err)
	}
	n := 0
	for _, line := range strings.Split(string(out), "\n") {
		f := strings.Fields(line)
		if len(f) < 3 {
			continue
		}
		if g, err := strconv.Atoi(f[1]); err == nil && g == pgid && !strings.ContainsAny(f[2], "ZXE") {
			n++
		}
	}
	return n
}

func describe(ps *os.ProcessState) string {
	if ws, ok := ps.Sys().(syscall.WaitStatus); ok && ws.Signaled() {
		if name, ok := map[syscall.Signal]string{syscall.SIGTERM: "SIGTERM", syscall.SIGKILL: "SIGKILL"}[ws.Signal()]; ok {
			return name
		}
		return "signal " + strconv.Itoa(int(ws.Signal()))
	}
	return "exit " + strconv.Itoa(ps.ExitCode())
}

type group struct {
	pgid   int
	leader chan string
}

// start runs script as /bin/sh -c in a new process group, reaps its leader in the
// background and returns once the script printed "ready".
func start(script string) group {
	r, w, err := os.Pipe()
	if err != nil {
		fail("pipe: %v", err)
	}
	cmd := exec.Command("/bin/sh", "-c", script)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Stdout = w
	if err := cmd.Start(); err != nil {
		fail("start %q: %v", script, err)
	}
	w.Close()
	g := group{pgid: cmd.Process.Pid, leader: make(chan string, 1)}
	reaped := make(chan struct{})
	go func() { cmd.Wait(); g.leader <- describe(cmd.ProcessState); close(reaped) }()
	cleanups = append(cleanups, func() {
		select {
		case <-reaped:
			if liveMembers(g.pgid) == 0 {
				return
			}
		default:
		}
		syscall.Kill(-g.pgid, syscall.SIGKILL)
	})
	line := make(chan string, 1)
	go func() { s, _ := bufio.NewReader(r).ReadString('\n'); line <- s; r.Close() }()
	select {
	case s := <-line:
		if s != "ready\n" {
			fail("group %q printed %q instead of ready", script, s)
		}
	case <-time.After(10 * time.Second):
		fail("group %q was not ready within 10 s", script)
	}
	return g
}

func leaderEnd(g group) string {
	select {
	case l := <-g.leader:
		return l
	case <-time.After(10 * time.Second):
		return "not reaped"
	}
}

func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }

// terminate starts one group per script, stops them all with one sys.Terminate call and
// records the call's duration, the leaders' ends and the live members left on return.
func terminate(scripts []string, reps int, obs map[string]any) []float64 {
	leaders, left := map[string]int{}, 0
	var stops []float64
	for i := 0; i < reps; i++ {
		var groups []group
		var pgids []int
		for _, s := range scripts {
			g := start(s)
			groups, pgids = append(groups, g), append(pgids, g.pgid)
		}
		t0 := time.Now()
		sys.Terminate(pgids)
		stops = append(stops, ms(time.Since(t0)))
		for _, g := range groups {
			left += liveMembers(g.pgid)
		}
		for _, g := range groups {
			leaders[leaderEnd(g)]++
		}
	}
	obs["leaders"], obs["left"] = leaders, left
	return stops
}

// run runs command through Session.Run and records each result, the live members left in
// the session's groups on return and the time Run took beyond opts.Timeout.
func run(command string, opts sys.Options, reps int, obs map[string]any) []float64 {
	var results []map[string]any
	var stops []float64
	left := 0
	for i := 0; i < reps; i++ {
		dir, err := os.MkdirTemp("", "l-terminate-prompt-exit-latency-")
		if err != nil {
			fail("temp dir: %v", err)
		}
		s := sys.NewWith(os.Environ(), dir)
		cleanups = append(cleanups, func() { sys.Terminate(s.LiveGroups()); os.RemoveAll(dir) })
		t0 := time.Now()
		r, err := s.Run(command, s.Cwd, opts)
		stops = append(stops, ms(time.Since(t0)-opts.Timeout))
		e := ""
		if err != nil {
			e = err.Error()
		}
		results = append(results, map[string]any{"status": r.Status, "output": r.Output, "timed_out": r.TimedOut, "error": e})
		for _, g := range s.Groups() {
			left += liveMembers(g)
		}
	}
	obs["results"], obs["left"] = results, left
	return stops
}

// escalate stops one group that ignores SIGTERM and records, 4.5 s after the call began,
// whether Terminate had returned and whether a member was still live.
func escalate(script string, obs map[string]any) []float64 {
	g := start(script)
	done := make(chan struct{})
	t0 := time.Now()
	go func() { sys.Terminate([]int{g.pgid}); close(done) }()
	time.Sleep(4500*time.Millisecond - time.Since(t0))
	returned := false
	select {
	case <-done:
		returned = true
	default:
	}
	obs["returned_by_4500ms"] = returned
	obs["alive_at_4500ms"] = liveMembers(g.pgid) > 0
	select {
	case <-done:
	case <-time.After(20 * time.Second):
		fail("Terminate did not return within 20 s")
	}
	stop := ms(time.Since(t0))
	obs["left"] = liveMembers(g.pgid)
	obs["leaders"] = map[string]int{leaderEnd(g): 1}
	return []float64{stop}
}

func main() {
	if len(os.Args) != 2 {
		fail("usage: go run l-terminate-prompt-exit-latency__driver.go <case>")
	}
	name := os.Args[1]
	obs := map[string]any{"case": name}
	var stops []float64
	switch name {
	case "prompt":
		stops = terminate([]string{promptScript}, 5, obs)
	case "several-prompt":
		stops = terminate([]string{promptScript, promptScript, promptScript, promptScript}, 5, obs)
	case "several-mixed":
		stops = terminate([]string{promptScript, delayedScript, promptScript, delayedScript}, 3, obs)
	case "ignore":
		stops = escalate(ignoreScript, obs)
	case "ignore-member":
		stops = escalate(ignoreMemberScript, obs)
	case "gone":
		gone := 0
		for i := 0; i < 5; i++ {
			cmd := exec.Command("/bin/sh", "-c", "exit 0")
			cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
			if err := cmd.Run(); err != nil {
				fail("exit 0: %v", err)
			}
			pgid := cmd.Process.Pid
			if errors.Is(syscall.Kill(-pgid, 0), syscall.ESRCH) {
				gone++
			}
			t0 := time.Now()
			sys.Terminate([]int{pgid})
			stops = append(stops, ms(time.Since(t0)))
		}
		obs["gone_before"] = gone
	case "timeout":
		stops = run("echo begun; sleep 30", sys.Options{Timeout: 300 * time.Millisecond}, 3, obs)
	case "sweep":
		stops = run("sleep 30 >/dev/null 2>&1 & echo started", sys.Options{KillGroupOnExit: true}, 5, obs)
	default:
		fail("unknown case %q", name)
	}
	sorted := append([]float64{}, stops...)
	sort.Float64s(sorted)
	obs["stop_ms"], obs["median_ms"] = stops, sorted[len(sorted)/2]
	b, err := json.Marshal(obs)
	if err != nil {
		fail("json: %v", err)
	}
	for _, c := range cleanups {
		c()
	}
	fmt.Println(string(b))
}
`;
// The sys test files before this change, with their SHA-256; they must stay byte-identical.
const SYS_TESTS = {
  'contract/sys_test.go': '85bb53212070bbb6035c094942e8411caa2410ff263c1c622ef944ba8fcf8940',
  'sys/caller_shell_bound_custody_test.go': 'e8ff3f0c6d428367e94b26f7b7716ee85c36286a685f6d1c72c093a0a6956efc',
  'sys/caller_shell_bound_observation_test.go': 'dfe9cb49b3654dbc4f7d889e3c6d34cd4113d1d26b412cecaa327cca4fe054cf',
  'sys/foreign_kill_test.go': '4e390e20163b5947c1982a0f60190e9402083cfbb511b4768cd68b33f5a2b4af',
  'sys/lifeline_test.go': '1b919db143eddd96f164e50458eb1de663dcbeb4702353614efcda1786645fdc',
  'sys/linux_timeout_observation_linux_test.go': 'c3d67c8c5a19062e675f54f28a0fa3e1938520eebae45821697a77a7ececf221',
  'sys/linux_timeout_observation_test.go': 'e8f9ae2c0245b5dae3203e9ae88f3b6dec9e54b83da42d95499af233f98a39e5',
  'sys/run_context_test.go': '7978c036ffbe7d8c1229fd5876055c684462940733ec65a139c1101760b8c9a8',
  'sys/sys_test.go': 'f661b215c5a11c1761d482177ef4df9450bd547ad227fd96b8b42b50bedb45e5',
  'sys/timeout_custody_liveness_test.go': 'b9caf93b90b07d5bcc0d6b9450257b68b8e13279ac8000431c1414e7a6eeab32',
};
const R = (status, output, timed_out) => ({error: '', output, status, timed_out});
// EXPECTED repeats the feature's expectations for the observer controls.
const EXPECTED = {
  'prompt': {want: {case: 'prompt', leaders: {SIGTERM: 5}, left: 0}, under: 50},
  'several-prompt': {want: {case: 'several-prompt', leaders: {SIGTERM: 20}, left: 0}, under: 50},
  'several-mixed': {want: {case: 'several-mixed', leaders: {SIGTERM: 6, 'exit 0': 6}, left: 0}, atLeast: 150, under: 300},
  'ignore': {want: {case: 'ignore', leaders: {SIGKILL: 1}, left: 0, alive_at_4500ms: true, returned_by_4500ms: false}, atLeast: 5000, under: 6000},
  'ignore-member': {want: {case: 'ignore-member', leaders: {SIGTERM: 1}, left: 0, alive_at_4500ms: true, returned_by_4500ms: false}, atLeast: 5000, under: 6000},
  'gone': {want: {case: 'gone', gone_before: 5}, under: 1},
  'timeout': {want: {case: 'timeout', left: 0, results: [R(143, 'begun\n', true), R(143, 'begun\n', true), R(143, 'begun\n', true)]}, under: 50},
  'sweep': {want: {case: 'sweep', left: 0, results: Array.from({length: 5}, () => R(0, 'started\n', false))}, under: 80},
};
const owned = [];
function temp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'l-terminate-prompt-exit-latency-')); fs.chmodSync(d, 0o700); owned.push(d); return d; }
function cleanup() { for (const d of owned) fs.rmSync(d, {recursive: true, force: true}); owned.length = 0; }
// Keep the caller's HOME and PATH: toolchain shims (mise) resolve go through them. PWD is the
// root so that go resolves the overlay's absolute paths as they are written.
function goEnv() { return {...process.env, PWD: root, LC_ALL: 'C', GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off'}; }
function go(args, timeout) {
  const r = spawnSync('go', args, {cwd: root, env: goEnv(), encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024});
  return {command: 'go ' + args.join(' '), status: r.status, signal: r.signal, error: r.error ? r.error.message : null, stdout: r.stdout || '', stderr: r.stderr || ''};
}

// The controls' Terminate and sweepGroup. BAD is the code before this change: 100 ms steps
// after SIGTERM, 20 ms steps in the sweep and after SIGKILL. GOOD checks at once and then
// waits 2, 4, 8 ... ms, at most 100 ms (20 ms in the sweep and after SIGKILL).
const BAD_TERMINATE = `// Terminate sends SIGTERM to each group, then SIGKILL after 5 seconds to those still alive.
func Terminate(groups []int) {
	var alive []int
	for _, g := range groups {
		if syscall.Kill(-g, syscall.SIGTERM) == nil {
			alive = append(alive, g)
		}
	}
	for i := 0; i < 50 && len(alive) > 0; i++ {
		time.Sleep(100 * time.Millisecond)
		var still []int
		for _, g := range alive {
			if syscall.Kill(-g, 0) == nil {
				still = append(still, g)
			}
		}
		alive = still
	}
	for _, g := range alive {
		syscall.Kill(-g, syscall.SIGKILL)
	}
	for len(alive) > 0 {
		var still []int
		for _, g := range alive {
			if present, err := groupOthers(g, 0); err != nil || present {
				still = append(still, g)
			}
		}
		alive = still
		if len(alive) > 0 {
			time.Sleep(20 * time.Millisecond)
		}
	}
}

`;
const BAD_SWEEP = `func sweepGroup(pgid int) {
	Terminate([]int{pgid})
	for i := 0; i < 50 && syscall.Kill(-pgid, 0) != syscall.ESRCH; i++ {
		time.Sleep(20 * time.Millisecond)
	}
}

`;
const GOOD_TERMINATE = `// Terminate sends SIGTERM to each group, then SIGKILL after 5 seconds to those still alive.
func Terminate(groups []int) {
	var alive []int
	for _, g := range groups {
		if syscall.Kill(-g, syscall.SIGTERM) == nil {
			alive = append(alive, g)
		}
	}
	alive = ltpelUntilGone(alive, time.Now().Add(5*time.Second), 100*time.Millisecond, func(g int) bool { return syscall.Kill(-g, 0) == nil })
	for _, g := range alive {
		syscall.Kill(-g, syscall.SIGKILL)
	}
	ltpelUntilGone(alive, time.Time{}, 20*time.Millisecond, func(g int) bool {
		present, err := groupOthers(g, 0)
		return err != nil || present
	})
}

func ltpelUntilGone(alive []int, deadline time.Time, most time.Duration, present func(int) bool) []int {
	for step := 2 * time.Millisecond; ; step = min(2*step, most) {
		var still []int
		for _, g := range alive {
			if present(g) {
				still = append(still, g)
			}
		}
		if alive = still; len(alive) == 0 {
			return nil
		}
		wait := step
		if !deadline.IsZero() {
			if wait = min(step, time.Until(deadline)); wait <= 0 {
				return alive
			}
		}
		time.Sleep(wait)
	}
}

`;
const GOOD_SWEEP = `func sweepGroup(pgid int) {
	Terminate([]int{pgid})
	ltpelUntilGone([]int{pgid}, time.Now().Add(time.Second), 20*time.Millisecond, func(g int) bool { return syscall.Kill(-g, 0) != syscall.ESRCH })
}

`;
// variantSys returns sys/sys.go with the Terminate and sweepGroup of the control variant.
function variantSys(variant) {
  let s = fs.readFileSync(path.join(root, 'sys/sys.go'), 'utf8');
  const cut = (from, to, by) => {
    const i = s.indexOf(from), j = s.indexOf(to, i);
    assert.ok(i >= 0 && j > i, 'sys/sys.go markers ' + JSON.stringify([from, to]));
    s = s.slice(0, i) + by + s.slice(j);
  };
  cut('// Terminate sends SIGTERM', 'func exitStatus(', variant === 'good' ? GOOD_TERMINATE : BAD_TERMINATE);
  cut('func sweepGroup(', '// commandLifecycle arbitrates', variant === 'good' ? GOOD_SWEEP : BAD_SWEEP);
  return s;
}

function execute(name, variant) {
  const d = temp();
  const replace = {[path.join(root, DRIVER)]: path.join(d, 'driver.go')};
  fs.writeFileSync(path.join(d, 'driver.go'), DRIVER_SOURCE, {mode: 0o600});
  if (variant) {
    fs.writeFileSync(path.join(d, 'sys.go'), variantSys(variant), {mode: 0o600});
    replace[path.join(root, 'sys/sys.go')] = path.join(d, 'sys.go');
  }
  fs.writeFileSync(path.join(d, 'overlay.json'), JSON.stringify({Replace: replace}), {mode: 0o600});
  const args = ['run', '-overlay', path.join(d, 'overlay.json'), DRIVER, name];
  return {name, ...go(args, 110000)};
}

// report checks that the collector ran cleanly and returns its observation.
function report(r) {
  const why = 'stop case ' + r.name + ': `' + r.command + '` exited ' + r.status + (r.signal ? ' (' + r.signal + ')' : '') + '\n' + r.stdout + r.stderr;
  assert.equal(r.error, null, 'process.error ' + why);
  assert.equal(r.signal, null, 'process.signal ' + why);
  assert.equal(r.status, 0, 'process.status ' + why);
  assert.equal(r.stderr, '', 'process.stderr ' + why);
  const lines = r.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, 'one JSON line ' + why);
  const obs = JSON.parse(lines[0]);
  assert.equal(obs.case, r.name, 'case ' + why);
  assert.ok(Array.isArray(obs.stop_ms) && obs.stop_ms.length > 0 && obs.stop_ms.every(x => typeof x === 'number'), 'stop_ms ' + why);
  const sorted = [...obs.stop_ms].sort((a, b) => a - b);
  assert.equal(obs.median_ms, sorted[Math.floor(sorted.length / 2)], 'median_ms ' + why);
  return obs;
}
const stops = obs => 'stop case ' + obs.case + ': stops ' + JSON.stringify(obs.stop_ms) + ' ms, median ' + obs.median_ms + ' ms';
function exact(obs, want) {
  const {stop_ms, median_ms, ...rest} = obs;
  assert.deepEqual(rest, want, 'observations of ' + stops(obs));
}
function under(obs, n) { assert.ok(obs.median_ms < n, stops(obs) + ', not under ' + n + ' ms'); }
function atLeast(obs, n) { assert.ok(obs.median_ms >= n, stops(obs) + ', not at least ' + n + ' ms'); }
function verify(obs, e) {
  exact(obs, e.want);
  if (e.atLeast !== undefined) atLeast(obs, e.atLeast);
  under(obs, e.under);
}

function control(kind) {
  const reject = (what, fn) => { let caught; try { fn(); } catch (e) { caught = e; } assert.ok(caught, 'negative missed assertion: ' + what); };
  if (kind === 'good') {
    for (const [name, e] of Object.entries(EXPECTED)) verify(report(execute(name, 'good')), e);
    process.stdout.write('l-terminate-prompt-exit-latency observer good\n');
    return;
  }
  // The old fixed steps give the same observations but stop no sooner than 100 ms.
  for (const name of ['prompt', 'several-prompt', 'timeout', 'sweep']) {
    const obs = report(execute(name, 'bad'));
    exact(obs, EXPECTED[name].want);
    reject(name + ' under ' + EXPECTED[name].under + ' ms', () => under(obs, EXPECTED[name].under));
  }
  // The report and the judges reject broken runs and wrong observations on their own.
  const good = {case: 'several-mixed', leaders: {SIGTERM: 6, 'exit 0': 6}, left: 0, median_ms: 235, stop_ms: [235, 240, 234]};
  const run = obs => ({name: 'several-mixed', command: 'synthetic', status: 0, signal: null, error: null, stderr: '', stdout: JSON.stringify(obs) + '\n'});
  verify(report(run(good)), EXPECTED['several-mixed']);
  for (const [what, mutate] of [['status', r => r.status = 1], ['signal', r => r.signal = 'SIGKILL'], ['error', r => r.error = 'watchdog'],
    ['stderr', r => r.stderr = 'compile error'], ['stdout', r => r.stdout = 'compile error\n'], ['two lines', r => r.stdout += r.stdout],
    ['case', r => r.name = 'prompt']]) {
    const r = run(good); mutate(r); reject(what, () => report(r));
  }
  for (const [what, obs] of [['no stops', {...good, stop_ms: []}], ['median', {...good, median_ms: 234}]]) reject(what, () => report(run(obs)));
  for (const [what, obs] of [['left', {...good, left: 1}], ['leaders', {...good, leaders: {SIGTERM: 6, SIGKILL: 6}}], ['extra', {...good, extra: true}]]) {
    reject(what, () => verify(report(run(obs)), EXPECTED['several-mixed']));
  }
  reject('sequential', () => verify(report(run({...good, median_ms: 470, stop_ms: [470]})), EXPECTED['several-mixed']));
  reject('early return', () => verify(report(run({...good, median_ms: 100, stop_ms: [100]})), EXPECTED['several-mixed']));
  process.stdout.write('l-terminate-prompt-exit-latency observer bad rejected\n');
  process.exitCode = 1;
}

if (require.main === module) {
  try { assert.equal(process.argv[2], '--control'); assert.ok(['good', 'bad'].includes(process.argv[3])); control(process.argv[3]); }
  catch (e) { console.error(e.stack); process.exitCode = 2; } finally { cleanup(); }
} else {
  const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
  When('l-terminate-prompt-exit-latency: I run the stop case {string}', {timeout: 120000}, function (name) {
    this.ltpel = report(execute(name, null));
  });
  Then('l-terminate-prompt-exit-latency: the stop case observations are exactly:', function (s) { exact(this.ltpel, JSON.parse(s)); });
  Then('l-terminate-prompt-exit-latency: the median stop took under {int} ms', function (n) { under(this.ltpel, n); });
  Then('l-terminate-prompt-exit-latency: the median stop took at least {int} ms', function (n) { atLeast(this.ltpel, n); });

  Given('l-terminate-prompt-exit-latency: the existing sys test files are unchanged', function () {
    const changed = Object.entries(SYS_TESTS).filter(([f, sum]) => {
      const p = path.join(root, f);
      return !fs.existsSync(p) || crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') !== sum;
    }).map(([f]) => f);
    assert.deepEqual(changed, [], 'existing sys test files edited or removed');
  });
  When('l-terminate-prompt-exit-latency: I run the Go package {string}', {timeout: 420000}, function (pkg) {
    this.ltpelPkg = go(['test', '-count=1', '-timeout=360s', pkg], 400000);
  });
  Then('l-terminate-prompt-exit-latency: the Go package run passed', function () {
    const r = this.ltpelPkg;
    const what = '`' + r.command + '` exited ' + r.status + (r.signal ? ' (' + r.signal + ')' : '') + '\n' + r.stdout + r.stderr;
    assert.equal(r.error, null, what);
    assert.equal(r.status, 0, what);
    assert.match(r.stdout, /^ok\s+github\.com\/KogenAI\/kogen-loop\/sys\s/m, what);
  });
  AfterAll(cleanup);
}
