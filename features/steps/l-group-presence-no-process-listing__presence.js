'use strict';
// Acceptance steps of l-group-presence-no-process-listing. The questions run in the Go
// program DRIVER_SOURCE below, kept as text: the steps write it to a temporary file and go run
// it through go -overlay at the virtual path features/steps/l-group-presence-no-process-listing__driver.go,
// together with EXPORT_SOURCE at the virtual path sys/lgpnpl_export_darwin.go, which exports
// groupOthers and kernelGroupOthers to the driver. Neither file exists and nothing is written
// into the checkout. The driver leads a new process group, sets PATH to a directory whose only
// entry is a ps that records each start, asks its questions and prints one JSON object; the
// Gherkin owns the expectations.
// `node features/steps/l-group-presence-no-process-listing__presence.js --control good|bad`
// runs the same driver against a known-good kernel implementation and the known-bad one (the
// ps listing kept, a kernel function that swallows a failed query), patched in through go -overlay.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const root = process.cwd();
const DRIVER = 'features/steps/l-group-presence-no-process-listing__driver.go';
const EXPORT = 'sys/lgpnpl_export_darwin.go';
const EXPORT_SOURCE = `//go:build darwin

package sys

// Acceptance export of l-group-presence-no-process-listing, served through go -overlay only.

func LgpnplGroupOthers(pgid, self int) (bool, error) { return groupOthers(pgid, self) }

func LgpnplKernelGroupOthers(pgid, self int, records func(pgid int) ([]byte, error)) (bool, error) {
	return kernelGroupOthers(pgid, self, records)
}
`;
const DRIVER_SOURCE = String.raw`//go:build ignore

// Acceptance driver of l-group-presence-no-process-listing, kept as text in
// features/steps/l-group-presence-no-process-listing__presence.js and run through go -overlay;
// this file does not exist in the checkout. It leads a new process group, sets PATH to a
// directory whose only entry is a ps that records each start, asks sys its group presence
// questions and prints one JSON object.
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/KogenAI/kogen-loop/sys"
)

var queryFailure = errors.New("lgpnpl injected kernel query failure")

var cleanups []func()

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	for i := len(cleanups) - 1; i >= 0; i-- {
		cleanups[i]()
	}
	os.Exit(2)
}

func ask(pgid, self int) map[string]any {
	present, err := sys.LgpnplGroupOthers(pgid, self)
	text := ""
	if err != nil {
		text = err.Error()
	}
	return map[string]any{"present": present, "error": text}
}

// children sums what this process's reaped children used; any started child adds to it.
func children() int64 {
	var u syscall.Rusage
	if err := syscall.Getrusage(syscall.RUSAGE_CHILDREN, &u); err != nil {
		fail("getrusage: %v", err)
	}
	return u.Utime.Nano() + u.Stime.Nano() + u.Minflt + u.Majflt + u.Nvcsw + u.Nivcsw
}

func main() {
	if err := syscall.Setpgid(0, 0); err != nil {
		fail("setpgid: %v", err)
	}
	own, self := syscall.Getpgrp(), os.Getpid()
	if own != self {
		fail("driver %d does not lead its group %d", self, own)
	}
	dir, err := os.MkdirTemp("", "lgpnpl-")
	if err != nil {
		fail("temp: %v", err)
	}
	cleanups = append(cleanups, func() { os.RemoveAll(dir) })
	bin, log := filepath.Join(dir, "bin"), filepath.Join(dir, "ps.log")
	shim := "#!/bin/sh\necho started >> \"$LGPNPL_PS_LOG\"\nexec /bin/ps \"$@\"\n"
	if err := os.Mkdir(bin, 0o700); err != nil {
		fail("shim: %v", err)
	}
	if err := os.WriteFile(filepath.Join(bin, "ps"), []byte(shim), 0o700); err != nil {
		fail("shim: %v", err)
	}
	os.Setenv("PATH", bin)
	os.Setenv("LGPNPL_PS_LOG", log)
	obs := map[string]any{}

	// 5 rounds of 20 questions about the driver's own group, asked by the driver: it is alone.
	type answer struct {
		present bool
		err     error
	}
	var answers [100]answer
	var rounds []float64
	before := children()
	for r := 0; r < 5; r++ {
		start := time.Now()
		for i := 0; i < 20; i++ {
			a := &answers[r*20+i]
			a.present, a.err = sys.LgpnplGroupOthers(own, self)
		}
		rounds = append(rounds, float64(time.Since(start).Nanoseconds())/1e6)
	}
	after := children()
	counts := map[string]int{}
	for _, a := range answers {
		counts[fmt.Sprintf("%v %v", a.present, a.err)]++
	}
	obs["timed_answers"] = counts
	obs["round_ms"] = rounds
	obs["children_started_while_timed"] = after != before

	obs["own_group_asked_by_itself"] = ask(own, self)
	obs["own_group_asked_without_exclusion"] = ask(own, 0)

	var queried []int
	_, err = sys.LgpnplKernelGroupOthers(own, self, func(pgid int) ([]byte, error) {
		queried = append(queried, pgid)
		return nil, queryFailure
	})
	asked := len(queried) > 0
	for _, g := range queried {
		asked = asked && g == own
	}
	obs["failed_kernel_query"] = map[string]any{"error_is_the_query_error": errors.Is(err, queryFailure), "queried_the_asked_group": asked}

	// A member leading its own group: live, then an unreaped zombie, then reaped.
	member := exec.Command("/bin/sleep", "600")
	member.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	if err := member.Start(); err != nil {
		fail("member: %v", err)
	}
	pgid, reaped := member.Process.Pid, false
	cleanups = append(cleanups, func() {
		if !reaped {
			syscall.Kill(pgid, syscall.SIGKILL)
			member.Wait()
		}
	})
	obs["group_with_one_live_member"] = ask(pgid, self)
	if err := syscall.Kill(pgid, syscall.SIGKILL); err != nil {
		fail("kill member: %v", err)
	}
	for deadline := time.Now().Add(10 * time.Second); ; time.Sleep(5 * time.Millisecond) {
		out, err := exec.Command("/bin/ps", "-o", "stat=", "-p", strconv.Itoa(pgid)).Output()
		if strings.HasPrefix(strings.TrimSpace(string(out)), "Z") {
			break
		}
		if time.Now().After(deadline) {
			fail("member %d did not become an unreaped zombie: %q %v", pgid, out, err)
		}
	}
	obs["group_with_only_an_unreaped_zombie"] = ask(pgid, self)
	member.Wait()
	reaped = true
	if err := syscall.Kill(-pgid, 0); err != syscall.ESRCH {
		fail("group %d still has a member after reaping: %v", pgid, err)
	}
	obs["empty_group"] = ask(pgid, self)

	started := 0
	if data, err := os.ReadFile(log); err == nil {
		started = strings.Count(string(data), "started\n")
	} else if !os.IsNotExist(err) {
		fail("ps log: %v", err)
	}
	obs["ps_started"] = started
	data, err := json.Marshal(obs)
	if err != nil {
		fail("json: %v", err)
	}
	for i := len(cleanups) - 1; i >= 0; i-- {
		cleanups[i]()
	}
	fmt.Println(string(data))
}
`;
// SYS_TESTS are the sys test files before this change; they stay byte-identical.
const SYS_TESTS = {
  'sys/caller_shell_bound_custody_test.go': 'e8ff3f0c6d428367e94b26f7b7716ee85c36286a685f6d1c72c093a0a6956efc',
  'sys/caller_shell_bound_observation_test.go': 'dfe9cb49b3654dbc4f7d889e3c6d34cd4113d1d26b412cecaa327cca4fe054cf',
  'sys/foreign_kill_test.go': '4e390e20163b5947c1982a0f60190e9402083cfbb511b4768cd68b33f5a2b4af',
  'sys/lifeline_test.go': '1b919db143eddd96f164e50458eb1de663dcbeb4702353614efcda1786645fdc',
  'sys/linux_timeout_observation_linux_test.go': 'c3d67c8c5a19062e675f54f28a0fa3e1938520eebae45821697a77a7ececf221',
  'sys/linux_timeout_observation_test.go': 'e8f9ae2c0245b5dae3203e9ae88f3b6dec9e54b83da42d95499af233f98a39e5',
  'sys/run_context_test.go': '7978c036ffbe7d8c1229fd5876055c684462940733ec65a139c1101760b8c9a8',
  'sys/sys_test.go': 'f661b215c5a11c1761d482177ef4df9450bd547ad227fd96b8b42b50bedb45e5',
  'sys/terminate_latency_test.go': '4e42a8865ba0ea1584dc346acd98c91f095cd05c7692e44d143e275507f97ee1',
  'sys/timeout_custody_liveness_test.go': 'b9caf93b90b07d5bcc0d6b9450257b68b8e13279ac8000431c1414e7a6eeab32',
};
// KEPT_SHA256 fingerprints, before this change, every file outside sys/, .kogen/ and features/
// (tracked or untracked and not ignored: the caller contract, docs, events and tool texts live
// there), plus sys/foreign_kill.go and sys/error.go (the refusal and error texts).
const KEPT_SHA256 = '736e0afb3a0fb67c699fec87842e6ba5cbb88169639935ba7d68ddbdb53263cc';
function git(args) {
  const r = spawnSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
  assert.equal(r.status, 0, '`git ' + args.join(' ') + '` exited ' + r.status + ': ' + (r.stderr || r.error));
  return r.stdout;
}
const keptPath = f => !/^(sys|\.kogen|features)\//.test(f) || f === 'sys/foreign_kill.go' || f === 'sys/error.go';
function keptFiles() {
  return git(['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean)
    .filter(keptPath).filter(f => fs.existsSync(path.join(root, f))).sort();
}
function keptFingerprint(files) {
  const h = crypto.createHash('sha256');
  for (const f of files) { h.update(f + '\0'); h.update(fs.readFileSync(path.join(root, f))); h.update('\0'); }
  return h.digest('hex');
}
function keptStatus() {
  return git(['status', '--porcelain', '--untracked-files=all']).split('\n').filter(l => l && keptPath(l.slice(3))).join('\n');
}
// EXPECTED repeats the feature's expectations for the observer controls.
const NONE = {present: false, error: ''};
const ONE = {present: true, error: ''};
const EXPECTED = {
  presence: {group_with_one_live_member: ONE, group_with_only_an_unreaped_zombie: NONE, empty_group: NONE},
  self: {own_group_asked_by_itself: NONE, own_group_asked_without_exclusion: ONE},
  failed: {failed_kernel_query: {error_is_the_query_error: true, queried_the_asked_group: true}},
  timed: {timed_answers: {'false <nil>': 100}, children_started_while_timed: false, ps_started: 0},
};
const UNDER_MS = 5;

const owned = [];
function temp() { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'l-group-presence-no-process-listing-')); fs.chmodSync(d, 0o700); owned.push(d); return d; }
function cleanup() { for (const d of owned) fs.rmSync(d, {recursive: true, force: true}); owned.length = 0; }
// Keep the caller's HOME and PATH: toolchain shims (mise) resolve go through them. PWD is the
// root so that go resolves the overlay's absolute paths as they are written.
function goEnv() { return {...process.env, PWD: root, LC_ALL: 'C', GOENV: 'off', GOTOOLCHAIN: 'local', GOPROXY: 'off', GOSUMDB: 'off'}; }
function go(args, timeout) {
  const r = spawnSync('go', args, {cwd: root, env: goEnv(), encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024});
  return {command: 'go ' + args.join(' '), status: r.status, signal: r.signal, error: r.error ? r.error.message : null, stdout: r.stdout || '', stderr: r.stderr || ''};
}

// The controls' kernel side. GOOD reads the kernel's kinfo_proc records of the group (648
// bytes each: p_stat at byte 36, SZOMB 5; p_pid at byte 40). BAD swallows a failed query
// and counts zombies; with BAD, sys/lifeline.go keeps its ps listing.
const KERNEL_HEAD = `//go:build darwin

package sys

import (
	"encoding/binary"
	"fmt"
	"syscall"
	"unsafe"
)

func groupRecords(pgid int) ([]byte, error) {
	mib := [4]int32{1, 14, 2, int32(pgid)}
	var size uintptr
	query := func(data unsafe.Pointer) error {
		_, _, errno := syscall.Syscall6(syscall.SYS___SYSCTL, uintptr(unsafe.Pointer(&mib[0])), 4, uintptr(data), uintptr(unsafe.Pointer(&size)), 0, 0)
		if errno != 0 {
			return errno
		}
		return nil
	}
	if err := query(nil); err != nil {
		return nil, err
	}
	data := make([]byte, max(size, 1))
	size = uintptr(len(data))
	if err := query(unsafe.Pointer(&data[0])); err != nil {
		return nil, err
	}
	if size > uintptr(len(data)) {
		return nil, fmt.Errorf("truncated group query")
	}
	return data[:size], nil
}

`;
const GOOD_KERNEL = KERNEL_HEAD + `func kernelGroupOthers(pgid, self int, records func(pgid int) ([]byte, error)) (bool, error) {
	data, err := records(pgid)
	if err != nil {
		return false, err
	}
	if len(data)%648 != 0 {
		return false, fmt.Errorf("partial process record")
	}
	for off := 0; off < len(data); off += 648 {
		if pid := int(int32(binary.LittleEndian.Uint32(data[off+40:]))); pid != self && data[off+36] != 5 {
			return true, nil
		}
	}
	return false, nil
}
`;
const BAD_KERNEL = KERNEL_HEAD + `func kernelGroupOthers(pgid, self int, records func(pgid int) ([]byte, error)) (bool, error) {
	data, err := records(pgid)
	if err != nil {
		return false, nil
	}
	for off := 0; off+648 <= len(data); off += 648 {
		if pid := int(int32(binary.LittleEndian.Uint32(data[off+40:]))); pid != self {
			return true, nil
		}
	}
	return false, nil
}
`;
// goodLifeline returns sys/lifeline.go with groupOthers answering from the kernel.
function goodLifeline() {
  const s = fs.readFileSync(path.join(root, 'sys/lifeline.go'), 'utf8');
  const head = 'func groupOthers(pgid, self int) (bool, error) {\n';
  assert.ok(s.includes(head), 'sys/lifeline.go has no ' + JSON.stringify(head));
  return s.replace(head, head + '\treturn kernelGroupOthers(pgid, self, groupRecords)\n}\n\nfunc lgpnplListedGroupOthers(pgid, self int) (bool, error) {\n');
}

function execute(variant) {
  if (process.platform !== 'darwin') throw new Error('l-group-presence-no-process-listing acceptance needs macOS (darwin), not ' + process.platform);
  const d = temp();
  fs.writeFileSync(path.join(d, 'driver.go'), DRIVER_SOURCE, {mode: 0o600});
  fs.writeFileSync(path.join(d, 'export.go'), EXPORT_SOURCE, {mode: 0o600});
  const replace = {[path.join(root, DRIVER)]: path.join(d, 'driver.go'), [path.join(root, EXPORT)]: path.join(d, 'export.go')};
  if (variant) {
    fs.writeFileSync(path.join(d, 'kernel.go'), variant === 'good' ? GOOD_KERNEL : BAD_KERNEL, {mode: 0o600});
    replace[path.join(root, 'sys/lgpnpl_control_darwin.go')] = path.join(d, 'kernel.go');
    if (variant === 'good') {
      fs.writeFileSync(path.join(d, 'lifeline.go'), goodLifeline(), {mode: 0o600});
      replace[path.join(root, 'sys/lifeline.go')] = path.join(d, 'lifeline.go');
    }
  }
  fs.writeFileSync(path.join(d, 'overlay.json'), JSON.stringify({Replace: replace}), {mode: 0o600});
  return go(['run', '-overlay', path.join(d, 'overlay.json'), DRIVER], 200000);
}

// report checks that the driver ran cleanly and returns its observations.
function report(r) {
  const why = 'group presence driver: `' + r.command + '` exited ' + r.status + (r.signal ? ' (' + r.signal + ')' : '') + '\n' + r.stdout + r.stderr;
  assert.equal(r.error, null, 'process.error ' + why);
  assert.equal(r.signal, null, 'process.signal ' + why);
  assert.equal(r.status, 0, 'process.status ' + why);
  assert.equal(r.stderr, '', 'process.stderr ' + why);
  const lines = r.stdout.split('\n').filter(Boolean);
  assert.equal(lines.length, 1, 'one JSON line ' + why);
  const obs = JSON.parse(lines[0]);
  assert.ok(Array.isArray(obs.round_ms) && obs.round_ms.length === 5 && obs.round_ms.every(x => typeof x === 'number'), 'round_ms ' + why);
  return obs;
}
function include(obs, want) {
  const got = Object.fromEntries(Object.keys(want).map(k => [k, obs[k]]));
  assert.deepEqual(got, want, 'answers of the group presence driver: ' + JSON.stringify(obs));
}
function median(obs) { const s = [...obs.round_ms].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function under(obs, n) {
  const m = median(obs);
  assert.ok(m < n, 'rounds of 20 questions took ' + JSON.stringify(obs.round_ms) + ' ms, median ' + m + ' ms, not under ' + n + ' ms');
}
function verify(obs) {
  for (const want of Object.values(EXPECTED)) include(obs, want);
  under(obs, UNDER_MS);
}

function control(kind) {
  const reject = (what, fn) => { let caught; try { fn(); } catch (e) { caught = e; } assert.ok(caught, 'negative missed assertion: ' + what); };
  if (kind === 'good') {
    verify(report(execute('good')));
    process.stdout.write('l-group-presence-no-process-listing observer good\n');
    return;
  }
  // The ps listing answers presence and self rightly but starts ps on every question and is
  // slow; the bad kernel function swallows the failed query.
  const bad = report(execute('bad'));
  include(bad, EXPECTED.presence);
  include(bad, EXPECTED.self);
  reject('swallowed query', () => include(bad, EXPECTED.failed));
  reject('ps listing', () => include(bad, {ps_started: 0}));
  reject('children', () => include(bad, {children_started_while_timed: false}));
  reject('slow', () => under(bad, UNDER_MS));
  // The judges reject wrong answers and broken runs on their own.
  const good = {...EXPECTED.presence, ...EXPECTED.self, ...EXPECTED.failed, ...EXPECTED.timed, round_ms: [0.6, 0.5, 0.7, 0.6, 0.6]};
  verify(good);
  for (const [what, obs] of [
    ['zombie counted', {...good, group_with_only_an_unreaped_zombie: ONE}],
    ['empty present', {...good, empty_group: ONE}],
    ['live absent', {...good, group_with_one_live_member: NONE}],
    ['self counted', {...good, own_group_asked_by_itself: ONE}],
    ['self excluded always', {...good, own_group_asked_without_exclusion: NONE}],
    ['error answer', {...good, empty_group: {present: false, error: 'boom'}}],
    ['other group queried', {...good, failed_kernel_query: {error_is_the_query_error: true, queried_the_asked_group: false}}],
    ['timed error', {...good, timed_answers: {'false <nil>': 99, 'false boom': 1}}],
    ['one slow round too many', {...good, round_ms: [0.6, 5, 0.7, 6, 5.1]}],
  ]) reject(what, () => verify(obs));
  const run = {command: 'synthetic', status: 0, signal: null, error: null, stdout: JSON.stringify(good) + '\n', stderr: ''};
  verify(report(run));
  for (const [what, change] of [['status', {status: 1}], ['signal', {signal: 'SIGKILL'}], ['error', {error: 'watchdog'}],
    ['stderr', {stderr: 'undefined: kernelGroupOthers\n'}], ['stdout', {stdout: ''}], ['two lines', {stdout: run.stdout + run.stdout}]]) {
    reject(what, () => report({...run, ...change}));
  }
  process.stdout.write('l-group-presence-no-process-listing observer bad rejected\n');
  process.exitCode = 1;
}

if (require.main === module) {
  try { assert.equal(process.argv[2], '--control'); assert.ok(['good', 'bad'].includes(process.argv[3])); control(process.argv[3]); }
  catch (e) { console.error(e.stack); process.exitCode = 2; } finally { cleanup(); }
} else {
  const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
  When('l-group-presence-no-process-listing: I ask the group presence questions on macOS', {timeout: 240000}, function () {
    this.lgpnpl = report(execute(null));
  });
  Then('l-group-presence-no-process-listing: the answers include exactly:', function (s) { include(this.lgpnpl, JSON.parse(s)); });
  Then('l-group-presence-no-process-listing: the median of the 5 rounds of 20 questions took under {int} ms', function (n) { under(this.lgpnpl, n); });

  Then('l-group-presence-no-process-listing: the files that carry events, tool text and contract rows are unchanged', function () {
    const files = keptFiles();
    assert.equal(keptFingerprint(files), KEPT_SHA256, 'files outside sys/, .kogen/ and features/, or sys/foreign_kill.go or sys/error.go, changed (' + files.length + ' files now):\n' + keptStatus(files));
  });

  Given('l-group-presence-no-process-listing: the existing sys test files are unchanged', function () {
    const changed = Object.entries(SYS_TESTS).filter(([f, sum]) => {
      const p = path.join(root, f);
      return !fs.existsSync(p) || crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') !== sum;
    }).map(([f]) => f);
    assert.deepEqual(changed, [], 'existing sys test files edited or removed');
  });
  When('l-group-presence-no-process-listing: I run the Go package {string}', {timeout: 420000}, function (pkg) {
    this.lgpnplPkg = go(['test', '-count=1', '-timeout=360s', pkg], 400000);
  });
  Then('l-group-presence-no-process-listing: the Go package run passed', function () {
    const r = this.lgpnplPkg;
    const what = '`' + r.command + '` exited ' + r.status + (r.signal ? ' (' + r.signal + ')' : '') + '\n' + r.stdout + r.stderr;
    assert.equal(r.error, null, what);
    assert.equal(r.status, 0, what);
    assert.match(r.stdout, /^ok\s+github\.com\/KogenAI\/kogen-loop\/sys\s/m, what);
  });
  AfterAll(cleanup);
}
