'use strict';
// Acceptance driver of L-CONSUMES-CONTRACT. kogen-loop depends on no other Kogen repository, so
// it has no consumes/ directory; its contract/ suite must cover everything its consumers
// (kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-setup,
// kogen-review, kogen-build) use. Every observation runs in a copy of the tree without .git and
// bin, with a fresh empty HOME, the Go proxy off, KOGEN_* variables removed and HTTP(S) proxies
// pointing at a closed local port. It runs the contract suite, observes the kogen-loop members
// the suite's Go files use with a go/types observer (OBSERVER below), reads contract/README.md,
// runs the suite against copies of the tree with one consumer-relied behaviour changed (each
// changed tree must still pass `go build ./...` and `go vet ./...`), and lists the module's
// non-standard dependencies. `node l-consumes-contract__contract.js --control good|bad` checks
// these observers on real go output of existing kogen-loop tests and on small synthetic inputs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {isDeepStrictEqual} = require('node:util');
const {spawn, spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ALLOWED = ['github.com/KogenAI/kogen-loop/api', 'github.com/KogenAI/kogen-loop/loop', 'github.com/KogenAI/kogen-loop/provider', 'github.com/KogenAI/kogen-loop/sys', 'github.com/KogenAI/kogen-loop/tools'];
const HEADER = '| Interface | Consumers | Derived from | Contract tests |';
const NO_CONSUMES = 'kogen-loop depends on no other Kogen repository, so it has no consumes/ directory.';
const DEPS_COMMAND = 'go list -deps -test ./...';
const SOURCES = {
  'kogen': 'a1a04454a891a8a8b823d5cdba5c77ab0301cc28',
  'kogen-coordinator': 'e26a4d75cdcc3bbcd6d900f2698cac8144bfdc19',
  'kogen-executor': '923b1adfa45cbed0c5a0722a1da1bd975b4409e5',
  'kogen-verification': 'f4d004d53a8d2928c778462944993a93fc5f5ee4',
  'kogen-shaping': 'b350d99e012f313f36693d6ee6613f38aea14808',
  'kogen-setup': '8ee693982160de909fa326a41c9bfcdf3e26ef74',
  'kogen-review': '3e1f93f3de911cd737832dbccc626b026a6bd072',
  'kogen-build': '6c012108c6faa4ea7814c76a360d3ab31d365b1c',
};
const SLOW_SECONDS = 30;
const PARALLEL = 4;

// OBSERVER type-checks the named packages of the tree it runs in, test files included, and
// prints one JSON object: "uses", every exported member of github.com/KogenAI/kogen-loop/api, loop, provider, sys
// and tools the files use, as "<pkg>.<Name>" or "<pkg>.<Type>.<Member>"; "imports", every
// import path of those files. It exits 2 when a named package is missing or does not
// type-check.
const OBSERVER = `package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/importer"
	"go/parser"
	"go/token"
	"go/types"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
)

type pkg struct {
	ImportPath, Dir, Export string
	GoFiles                 []string
	ImportMap               map[string]string
	DepOnly                 bool
	Error                   *struct{ Err string }
}

var tracked = map[string]bool{"github.com/KogenAI/kogen-loop/api": true, "github.com/KogenAI/kogen-loop/loop": true, "github.com/KogenAI/kogen-loop/provider": true, "github.com/KogenAI/kogen-loop/sys": true, "github.com/KogenAI/kogen-loop/tools": true}

func fail(format string, a ...any) {
	fmt.Fprintln(os.Stderr, fmt.Sprintf(format, a...))
	os.Exit(2)
}

func main() {
	args := append([]string{"list", "-e", "-export", "-deps", "-test", "-json"}, os.Args[1:]...)
	cmd := exec.Command("go", args...)
	cmd.Stderr = os.Stderr
	out, err := cmd.Output()
	if err != nil {
		fail("go %s: %v", strings.Join(args, " "), err)
	}
	dec := json.NewDecoder(strings.NewReader(string(out)))
	var pkgs []pkg
	exports := map[string]string{}
	for {
		var p pkg
		if err := dec.Decode(&p); err == io.EOF {
			break
		} else if err != nil {
			fail("go list output: %v", err)
		}
		pkgs = append(pkgs, p)
		if p.Export != "" {
			exports[p.ImportPath] = p.Export
		}
	}
	uses, imports, files := map[string]bool{}, map[string]bool{}, 0
	for _, p := range pkgs {
		if p.DepOnly || strings.HasSuffix(p.ImportPath, ".test") {
			continue
		}
		if p.Error != nil && !strings.Contains(p.Error.Err, "no non-test Go files") {
			fail("%s: %s", p.ImportPath, p.Error.Err)
		}
		fs := token.NewFileSet()
		var afs []*ast.File
		for _, f := range p.GoFiles {
			af, err := parser.ParseFile(fs, filepath.Join(p.Dir, f), nil, 0)
			if err != nil {
				fail("%v", err)
			}
			afs = append(afs, af)
			files++
			for _, im := range af.Imports {
				s, _ := strconv.Unquote(im.Path.Value)
				imports[s] = true
			}
		}
		imp := importer.ForCompiler(fs, "gc", func(path string) (io.ReadCloser, error) {
			if m, ok := p.ImportMap[path]; ok {
				path = m
			}
			e, ok := exports[path]
			if !ok {
				return nil, fmt.Errorf("no export data for %s", path)
			}
			return os.Open(e)
		})
		info := &types.Info{Uses: map[*ast.Ident]types.Object{}, Selections: map[*ast.SelectorExpr]*types.Selection{}}
		var errs []string
		conf := types.Config{Importer: imp, Error: func(err error) { errs = append(errs, err.Error()) }}
		conf.Check(p.ImportPath, fs, afs, info)
		if len(errs) > 0 {
			fail("type-checking %s: %s", p.ImportPath, strings.Join(errs, "; "))
		}
		for _, obj := range info.Uses {
			if k := member(obj, nil); k != "" {
				uses[k] = true
			}
		}
		for _, sel := range info.Selections {
			if k := member(sel.Obj(), sel.Recv()); k != "" {
				uses[k] = true
			}
		}
	}
	if files == 0 {
		fail("no Go files in %s", strings.Join(os.Args[1:], " "))
	}
	json.NewEncoder(os.Stdout).Encode(map[string][]string{"uses": sorted(uses), "imports": sorted(imports)})
}

func member(obj types.Object, recv types.Type) string {
	if obj == nil || obj.Pkg() == nil || !tracked[obj.Pkg().Path()] || !obj.Exported() {
		return ""
	}
	short := strings.TrimPrefix(obj.Pkg().Path(), "github.com/KogenAI/kogen-loop/")
	switch o := obj.(type) {
	case *types.Func:
		if sig, ok := o.Type().(*types.Signature); ok && sig.Recv() != nil {
			return short + "." + typeName(sig.Recv().Type()) + "." + o.Name()
		}
	case *types.Var:
		if o.IsField() {
			if recv != nil {
				return short + "." + typeName(recv) + "." + o.Name()
			}
			scope := o.Pkg().Scope()
			for _, n := range scope.Names() {
				if tn, ok := scope.Lookup(n).(*types.TypeName); ok {
					if st, ok := tn.Type().Underlying().(*types.Struct); ok {
						for i := 0; i < st.NumFields(); i++ {
							if st.Field(i) == o {
								return short + "." + n + "." + o.Name()
							}
						}
					}
				}
			}
			return short + ".?." + o.Name()
		}
	}
	if obj.Parent() != obj.Pkg().Scope() {
		return ""
	}
	return short + "." + obj.Name()
}

func typeName(t types.Type) string {
	if p, ok := t.(*types.Pointer); ok {
		t = p.Elem()
	}
	if n, ok := t.(*types.Named); ok {
		return n.Obj().Name()
	}
	return "?"
}

func sorted(m map[string]bool) []string {
	s := make([]string, 0, len(m))
	for k := range m {
		s = append(s, k)
	}
	sort.Strings(s)
	return s
}
`;

let goBin, offline;
// go is the toolchain's own go binary, so no PATH wrapper is involved.
function go() {
  if (!goBin) {
    const r = spawnSync('go', ['env', 'GOROOT'], {encoding:'utf8'});
    assert.equal(r.status, 0, 'go env GOROOT: ' + r.stderr);
    goBin = path.join(r.stdout.trim(), 'bin', 'go');
  }
  return goBin;
}
// offlineEnv keeps the caller's Go caches but nothing that reaches a network, a login or Kogen.
function offlineEnv() {
  if (!offline) {
    const r = spawnSync(go(), ['env', '-json', 'GOCACHE', 'GOMODCACHE', 'GOPATH'], {encoding:'utf8'});
    assert.equal(r.status, 0, 'go env: ' + r.stderr);
    const env = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (!k.startsWith('KOGEN_') && !/^(HOME|GOFLAGS|GOPROXY|GOTOOLCHAIN|GOENV)$/.test(k) && !/_proxy$/i.test(k)) env[k] = v;
    }
    const proxy = 'http://127.0.0.1:9';
    offline = {...env, ...JSON.parse(r.stdout), HOME:fs.mkdtempSync(path.join(os.tmpdir(), 'l-consumes-contract-home-')),
      GOENV:'off', GOPROXY:'off', GOTOOLCHAIN:'local', HTTP_PROXY:proxy, HTTPS_PROXY:proxy, ALL_PROXY:proxy,
      http_proxy:proxy, https_proxy:proxy, all_proxy:proxy, NO_PROXY:'', no_proxy:''};
  }
  return offline;
}
function copyTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-consumes-contract-tree-'));
  const skip = new Set(['.git', 'bin', 'node_modules'].map(n => path.join(ROOT, n)));
  fs.cpSync(ROOT, dir, {recursive:true, filter:src => !skip.has(src)});
  return dir;
}
async function inCopy(fn) {
  const tree = copyTree();
  try { return await fn(tree); } finally { fs.rmSync(tree, {recursive:true, force:true}); }
}
function run(cmd, args, cwd) {
  return new Promise(resolve => {
    const p = spawn(cmd, args, {cwd, env:offlineEnv()});
    let out = '', err = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; });
    p.on('close', code => resolve({code, out, err}));
  });
}
function goFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, {recursive:true}).filter(f => f.endsWith('.go')).sort();
}
// summarize reads `go test -json` output: each test's and each package's final action.
function summarize(r) {
  const tests = {}, packages = {};
  let buildFailed = false;
  for (const line of r.out.split('\n')) {
    if (!line.startsWith('{')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.Action === 'build-fail' || e.FailedBuild) buildFailed = true;
    if (!['pass', 'fail', 'skip'].includes(e.Action)) continue;
    if (e.Test) tests[e.Package + ' ' + e.Test] = e.Action;
    else packages[e.Package] = {action:e.Action, elapsed:e.Elapsed};
  }
  const by = a => Object.keys(tests).filter(k => tests[k] === a).sort();
  return {exit:r.code, buildFailed, packages, passed:by('pass'), failed:by('fail'), skipped:by('skip')};
}
// suiteObservation is what an ordinary run of the packages shows: it passed, ran tests, skipped
// none, every package is listed by `go list ./...` (so `go test ./...` runs it) and is fast.
function suiteObservation(s, listed, files) {
  const pkgs = Object.keys(s.packages).sort();
  return {
    exit:s.exit, build_failed:s.buildFailed,
    packages_not_passed:pkgs.filter(p => s.packages[p].action !== 'pass'),
    tests_failed:s.failed, tests_skipped:s.skipped, ran_tests:s.passed.length > 0,
    packages_over_30_seconds:pkgs.filter(p => !(s.packages[p].elapsed <= SLOW_SECONDS)),
    not_in_go_list_all:pkgs.filter(p => !listed.includes(p)),
    build_constraints:Object.keys(files).filter(f => /^\/\/(go:build| \+build)/m.test(files[f])).sort(),
  };
}
async function suite(tree, packages = ['./contract/...'], args = []) {
  const s = summarize(await run(go(), ['test', '-json', '-count=1', ...args, ...packages], tree));
  const l = await run(go(), ['list', './...'], tree);
  assert.equal(l.code, 0, 'go list ./...: ' + l.err);
  return suiteObservation(s, l.out.split('\n').filter(Boolean), contractFiles(tree));
}
function contractFiles(tree) {
  const files = {};
  for (const f of goFiles(path.join(tree, 'contract'))) files['contract/' + f] = fs.readFileSync(path.join(tree, 'contract', f), 'utf8');
  return files;
}
// uses runs OBSERVER on the packages in tree.
async function uses(tree, packages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-consumes-contract-uses-'));
  try {
    fs.writeFileSync(path.join(dir, 'main.go'), OBSERVER);
    fs.writeFileSync(path.join(dir, 'go.mod'), 'module contractuses\n\ngo 1.27.2\n');
    const b = await run(go(), ['build', '-o', path.join(dir, 'uses'), '.'], dir);
    assert.equal(b.code, 0, 'building the usage observer: ' + b.err);
    const r = await run(path.join(dir, 'uses'), packages, tree);
    assert.equal(r.code, 0, 'usage observer on ' + packages.join(' ') + ': ' + r.err);
    return JSON.parse(r.out);
  } finally {
    fs.rmSync(dir, {recursive:true, force:true});
  }
}
// readmeRows parses the contract/README.md table into rows of its four cells.
function readmeRows(text) {
  const lines = text.split('\n');
  const at = lines.indexOf(HEADER);
  if (at === -1) return null;
  const rows = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.replace(/^\|\s?/, '').replace(/\s?\|$/, '').split(' | ').map(c => c.trim()));
  }
  return rows;
}
const ticked = cell => cell.split(', ').map(s => (/^`([^`]+)`$/.exec(s) || [])[1]);
// inventoryObservation compares the inventory with the members the suite's files use, the
// suite's imports and files, and the README: every list is empty when they agree.
function inventoryObservation(inventory, used, imports, files, readme, tests) {
  const o = {unused:[], missing_rows:[], extra_rows:[], duplicate_rows:[], wrong_consumers:[], bad_sources:[], unknown_tests:[],
    missing_source_commits:[], foreign_imports:[], parent_paths:[]};
  const rows = readmeRows(readme);
  if (rows === null) o.missing_rows.push('table ' + HEADER);
  const seen = {};
  for (const row of rows || []) {
    const [member] = ticked(row[0] || '');
    if (seen[member]) o.duplicate_rows.push(member);
    seen[member] = row;
    if (!(member in inventory)) { o.extra_rows.push(String(member)); continue; }
    if (row.length !== 4 || row[1] !== inventory[member].join(', ')) o.wrong_consumers.push(member);
    const sources = ticked(row[2] || '');
    if (!sources.every(s => s && inventory[member].some(c => s.startsWith(c + '/') && /^[\w./-]+\.go$/.test(s.slice(c.length + 1))))) o.bad_sources.push(member);
    if (!ticked(row[3] || '').every(t => t && tests.includes(t))) o.unknown_tests.push(member);
  }
  for (const member of Object.keys(inventory)) {
    if (!used.includes(member)) o.unused.push(member);
    if (!seen[member]) o.missing_rows.push(member);
  }
  for (const [consumer, commit] of Object.entries(SOURCES)) if (!readme.includes(commit)) o.missing_source_commits.push(consumer + ' ' + commit);
  o.foreign_imports = imports.filter(i => {
    const first = i.split('/')[0];
    if (i.startsWith('github.com/KogenAI/kogen-loop/')) return !ALLOWED.includes(i) && !i.startsWith('github.com/KogenAI/kogen-loop/contract');
    return first.includes('.') || first === 'go';
  });
  o.parent_paths = Object.keys(files).filter(f => /["`]\.\.(?:[/"`])/.test(files[f]));
  for (const k of Object.keys(o)) o[k] = [...new Set(o[k])].sort();
  return o;
}
async function inventoryRun(inventory) {
  return inCopy(async tree => {
    const u = await uses(tree, ['./contract/...']);
    const l = await run(go(), ['test', '-list', '.', './contract/...'], tree);
    assert.equal(l.code, 0, 'go test -list . ./contract/...: ' + l.out + l.err);
    const tests = l.out.split('\n').filter(s => /^Test\w*$/.test(s));
    const readme = path.join(tree, 'contract', 'README.md');
    const text = fs.existsSync(readme) ? fs.readFileSync(readme, 'utf8') : '';
    return inventoryObservation(inventory, u.uses, u.imports, contractFiles(tree), text, tests);
  });
}
// outcome runs the packages' tests in a fresh copy of the tree, after applying change when
// given: {file, from, to, count} replaces every occurrence of from, which must occur count times.
async function outcome(change, packages = ['./contract/...'], args = []) {
  return inCopy(async tree => {
    if (change) {
      const file = path.join(tree, change.file);
      const text = fs.readFileSync(file, 'utf8');
      const n = text.split(change.from).length - 1;
      if (n !== change.count) return 'anchor found ' + n + ' times';
      fs.writeFileSync(file, text.split(change.from).join(change.to));
      const b = await run(go(), ['build', '-trimpath', '-o', os.devNull, './...'], tree);
      if (b.code !== 0) return 'change does not build';
      // go vet type-checks every package with its tests, so a change that breaks an existing
      // test file is reported here, not as a contract failure.
      const v = await run(go(), ['vet', './...'], tree);
      if (v.code !== 0) return 'change does not vet';
    }
    const s = summarize(await run(go(), ['test', '-trimpath', '-json', '-count=1', '-timeout', '180s', ...args, ...packages], tree));
    if (s.buildFailed) return 'contract does not build';
    if (s.failed.length > 0) return 'contract failed';
    if (s.exit !== 0) return 'go test exited ' + s.exit;
    if (s.passed.length === 0) return 'no contract tests';
    if (s.skipped.length > 0) return 'contract skipped tests';
    return 'contract passed';
  });
}
async function pool(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({length:Math.min(PARALLEL, items.length)}, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }));
  return results;
}
// foreignPackages lists the packages `go list -deps -test` reports that are neither in the
// standard library nor kogen-loop's own.
function foreignPackages(listed) {
  return listed.filter(l => !l.standard && !/^github\.com\/KogenAI\/kogen-loop(\/| |\.test$|$)/.test(l.path)).map(l => l.path).sort();
}
function consumesDocs(readme) {
  const at = readme.indexOf('\n## Consumed Kogen repositories\n');
  const section = at === -1 ? '' : readme.slice(at + 1).split(/\n## /)[0];
  return {section:at !== -1, states_no_consumes:section.includes(NO_CONSUMES), names_the_check:section.includes(DEPS_COMMAND)};
}
async function consumesRun() {
  return inCopy(async tree => {
    const l = await run(go(), ['list', '-deps', '-test', '-f', '{{.Standard}} {{.ImportPath}}', './...'], tree);
    assert.equal(l.code, 0, 'go list -deps -test ./...: ' + l.err);
    const listed = l.out.split('\n').filter(Boolean).map(s => ({standard:s.startsWith('true '), path:s.slice(s.indexOf(' ') + 1)}));
    const m = await run(go(), ['list', '-m', 'all'], tree);
    assert.equal(m.code, 0, 'go list -m all: ' + m.err);
    const readme = path.join(tree, 'contract', 'README.md');
    return {
      consumes_directory:fs.existsSync(path.join(tree, 'consumes')),
      go_mod:fs.readFileSync(path.join(tree, 'go.mod'), 'utf8'), go_sum:fs.existsSync(path.join(tree, 'go.sum')),
      modules:m.out.split('\n').filter(Boolean), foreign_packages:foreignPackages(listed),
      contract_readme:consumesDocs(fs.existsSync(readme) ? fs.readFileSync(readme, 'utf8') : ''),
    };
  });
}

const CUT_TEST = ['-run', '^TestCutKeepsHeadAndTailAroundAMarker$'];
const CUT_HEAD = {file:'tools/tools.go', from:'defaultResultHead = 4096', to:'defaultResultHead = 2048', count:1};
// TEST_BREAK builds (go build skips test files) but breaks sys's tests, which go vet catches.
const TEST_BREAK = {file:'sys/sys_test.go', from:'func TestMain(m *testing.M) {', to:'func TestMain(m *testing.M) {\n\tundefinedContractControl()', count:1};
const GOOD_SUITE = {exit:0, build_failed:false, packages_not_passed:[], tests_failed:[], tests_skipped:[], ran_tests:true, packages_over_30_seconds:[], not_in_go_list_all:[], build_constraints:[]};
const EMPTY = {unused:[], missing_rows:[], extra_rows:[], duplicate_rows:[], wrong_consumers:[], bad_sources:[], unknown_tests:[], missing_source_commits:[], foreign_imports:[], parent_paths:[]};
const SAMPLE = {'sys.AsError':['kogen', 'kogen-review'], 'provider.Catalog':['kogen-setup'], 'sys.Session.RunContext':['kogen-verification', 'kogen-shaping']};
const SAMPLE_README = ['# Contract suite', '', 'Sources: ' + Object.values(SOURCES).join(', '), '', HEADER, '| --- | --- | --- | --- |',
  '| `sys.AsError` | kogen, kogen-review | `kogen/cli/native.go`, `kogen-review/review/independent.go` | `TestErrors` |',
  '| `provider.Catalog` | kogen-setup | `kogen-setup/setup/init_route.go` | `TestCatalog`, `TestErrors` |',
  '| `sys.Session.RunContext` | kogen-verification, kogen-shaping | `kogen-verification/verify/probe.go` | `TestRunContext` |', ''].join('\n');
const TESTS = ['TestErrors', 'TestCatalog', 'TestRunContext'];
const IMPORTS = ['testing', 'net/http/httptest', 'github.com/KogenAI/kogen-loop/sys', 'github.com/KogenAI/kogen-loop/provider'];
const sample = (o = {}) => inventoryObservation(SAMPLE, o.used || Object.keys(SAMPLE), o.imports || IMPORTS, o.files || {'contract/a_test.go':'p := filepath.Join(dir, "testdata", "x")'}, o.readme || SAMPLE_README, o.tests || TESTS);
const DOCS = '# Contract suite\n\n## Consumed Kogen repositories\n\n' + NO_CONSUMES + ' `' + DEPS_COMMAND + '` lists only standard-library and kogen-loop packages.\n\n## Sources\n';
const GOOD_DOCS = {section:true, states_no_consumes:true, names_the_check:true};
const LISTED = [{standard:true, path:'context'}, {standard:false, path:'github.com/KogenAI/kogen-loop/sys'}, {standard:false, path:'github.com/KogenAI/kogen-loop/sys [github.com/KogenAI/kogen-loop/sys.test]'}, {standard:false, path:'github.com/KogenAI/kogen-loop/sys.test'}, {standard:false, path:'github.com/KogenAI/kogen-loop/cmd/kogen-loop'}];
// Each control case returns true when the observer accepted its input.
const CONTROLS = {
  good:[
    () => inCopy(async t => isDeepStrictEqual(await suite(t, ['./tools'], CUT_TEST), GOOD_SUITE)),
    async () => (await outcome(null, ['./tools'], CUT_TEST)) === 'contract passed',
    async () => (await outcome(CUT_HEAD, ['./tools'], CUT_TEST)) === 'contract failed',
    () => inCopy(async t => { const u = await uses(t, ['./cmd/kogen-loop']); return u.uses.includes('api.DecodeTask') && u.uses.includes('loop.NewSession'); }),
    async () => isDeepStrictEqual(sample(), EMPTY),
    async () => isDeepStrictEqual(foreignPackages(LISTED), []),
    async () => isDeepStrictEqual(consumesDocs(DOCS), GOOD_DOCS),
  ],
  bad:[
    () => inCopy(async t => { const f = path.join(t, CUT_HEAD.file); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace(CUT_HEAD.from, CUT_HEAD.to)); return isDeepStrictEqual(await suite(t, ['./tools'], CUT_TEST), GOOD_SUITE); }),
    async () => (await outcome({...CUT_HEAD, from:'defaultResultHead = 4097'}, ['./tools'], CUT_TEST)) === 'contract failed',
    async () => (await outcome(CUT_HEAD, ['./tools'], ['-run', '^NoSuchTest$'])) === 'contract failed',
    async () => (await outcome(TEST_BREAK, ['./tools'], CUT_TEST)) === 'contract passed',
    async () => isDeepStrictEqual(sample({used:['sys.AsError', 'provider.Catalog']}), EMPTY),
    async () => isDeepStrictEqual(sample({readme:SAMPLE_README.replace('| kogen-setup |', '| kogen |')}), EMPTY),
    async () => isDeepStrictEqual(sample({readme:SAMPLE_README.replace('`kogen-verification/verify/probe.go`', '`kogen-build/build/probe.go`')}), EMPTY),
    async () => isDeepStrictEqual(sample({tests:['TestErrors', 'TestCatalog']}), EMPTY),
    async () => isDeepStrictEqual(sample({readme:SAMPLE_README.split('\n').filter(l => !l.includes('`provider.Catalog`')).join('\n')}), EMPTY),
    async () => isDeepStrictEqual(sample({readme:SAMPLE_README.replace(SOURCES['kogen-review'], 'cfc2fb29917c')}), EMPTY),
    async () => isDeepStrictEqual(sample({imports:[...IMPORTS, 'github.com/KogenAI/kogen-loop/internal/delivery']}), EMPTY),
    async () => isDeepStrictEqual(sample({imports:[...IMPORTS, 'github.com/KogenAI/kogen-review/review']}), EMPTY),
    async () => isDeepStrictEqual(sample({files:{'contract/a_test.go':'os.ReadFile("../provider/wire.go")'}}), EMPTY),
    async () => isDeepStrictEqual(foreignPackages([...LISTED, {standard:false, path:'github.com/KogenAI/kogen-coordinator/project'}]), []),
    async () => isDeepStrictEqual(consumesDocs(DOCS.replace(NO_CONSUMES, 'kogen-loop has no consumes/ directory.')), GOOD_DOCS),
    async () => isDeepStrictEqual(consumesDocs(DOCS.replace('## Consumed Kogen repositories', '## Consumers')), GOOD_DOCS),
  ],
};

if (require.main === module) {
  const kind = process.argv[3];
  if (process.argv[2] !== '--control' || !(kind in CONTROLS)) {
    console.log('usage: l-consumes-contract__contract.js --control good|bad'); process.exitCode = 2;
  } else {
    (async () => {
      const accepted = [];
      for (const c of CONTROLS[kind]) accepted.push(await c());
      if (kind === 'good' && accepted.every(Boolean)) console.log('l-consumes-contract observer accepted');
      else if (kind === 'bad' && !accepted.some(Boolean)) { console.log('l-consumes-contract observer rejected'); process.exitCode = 1; }
      else { console.log('l-consumes-contract observer control ' + kind + ' failed: ' + JSON.stringify(accepted)); process.exitCode = 3; }
    })().catch(e => { console.log('l-consumes-contract observer control error: ' + e.message); process.exitCode = 4; });
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  const json = s => JSON.parse(s);
  Given('l-consumes-contract: the kogen-loop members its consumers use are:', function (table) {
    this.lccInventory = Object.fromEntries(table.hashes().map(r => [r.member, r.consumers.split(', ')]));
  });
  When('l-consumes-contract: I compare the contract suite and contract\\/README.md with that inventory', {timeout:600000}, async function () {
    this.lccInventoryObservation = await inventoryRun(this.lccInventory);
  });
  Then('l-consumes-contract: the contract inventory observations are:', function (doc) {
    assert.deepEqual(this.lccInventoryObservation, json(doc), 'contract inventory ' + JSON.stringify(this.lccInventoryObservation));
  });
  When('l-consumes-contract: I run the kogen-loop contract suite offline', {timeout:600000}, async function () {
    this.lccSuite = await inCopy(tree => suite(tree));
  });
  Then('l-consumes-contract: the contract suite run observations are:', function (doc) {
    assert.deepEqual(this.lccSuite, json(doc), 'contract suite run ' + JSON.stringify(this.lccSuite));
  });
  Given('l-consumes-contract: these consumer-relied kogen-loop behaviour changes:', function (doc) {
    this.lccChanges = json(doc);
  });
  When('l-consumes-contract: I run the contract suite on the unchanged tree and after each change', {timeout:1800000}, async function () {
    const cases = [{id:'unchanged', change:null}, ...this.lccChanges.map(c => ({id:c.id, change:c}))];
    const results = await pool(cases, c => outcome(c.change));
    this.lccOutcomes = Object.fromEntries(cases.map((c, i) => [c.id, results[i]]));
  });
  Then('l-consumes-contract: the contract suite outcomes are:', function (doc) {
    assert.deepEqual(this.lccOutcomes, json(doc), 'contract suite outcomes ' + JSON.stringify(this.lccOutcomes));
  });
  When('l-consumes-contract: I observe what kogen-loop consumes from other Kogen repositories', {timeout:600000}, async function () {
    this.lccConsumes = await consumesRun();
  });
  Then('l-consumes-contract: the consumed-repository observations are:', function (doc) {
    assert.deepEqual(this.lccConsumes, json(doc), 'consumed repositories ' + JSON.stringify(this.lccConsumes));
  });
}
