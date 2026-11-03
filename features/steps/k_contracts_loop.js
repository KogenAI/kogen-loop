'use strict';
// Acceptance driver of K-CONTRACTS-LOOP: kogen-loop's contract/ suite pins what its consumers
// (kogen, kogen-coordinator, kogen-executor, kogen-verification, kogen-shaping, kogen-build)
// use. Every observation runs in a copy of the tree without .git and bin, with a fresh empty
// HOME, the Go proxy off, KOGEN_* variables removed and HTTP(S) proxies pointing at a closed
// local port. It runs the suite, observes the kogen-loop members the suite's Go files use
// (k_contracts_loop_uses.go.txt, a go/types observer), reads contract/README.md, and runs the
// suite against copies of the tree with one consumer-relied behaviour changed; each changed
// tree must still pass `go build ./...` and `go vet ./...` before the suite's verdict counts.
// `node k_contracts_loop.js --control good|bad` checks these observers on real go output of
// existing kogen-loop tests and on small synthetic README, inventory and import inputs.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {isDeepStrictEqual} = require('node:util');
const {spawn, spawnSync} = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const ALLOWED = ['kogen-loop/api', 'kogen-loop/loop', 'kogen-loop/provider', 'kogen-loop/sys', 'kogen-loop/tools'];
const HEADER = '| Interface | Consumers | Derived from | Contract tests |';
const RULE = 'An intended interface change edits this contract together with paired consumer items.';
const SLOW_SECONDS = 30;
const PARALLEL = 4;

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
    offline = {...env, ...JSON.parse(r.stdout), HOME:fs.mkdtempSync(path.join(os.tmpdir(), 'k-contracts-loop-home-')),
      GOENV:'off', GOPROXY:'off', GOTOOLCHAIN:'local', HTTP_PROXY:proxy, HTTPS_PROXY:proxy, ALL_PROXY:proxy,
      http_proxy:proxy, https_proxy:proxy, all_proxy:proxy, NO_PROXY:'', no_proxy:''};
  }
  return offline;
}
function copyTree() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-contracts-loop-tree-'));
  const skip = new Set(['.git', 'bin', 'node_modules'].map(n => path.join(ROOT, n)));
  fs.cpSync(ROOT, dir, {recursive:true, filter:src => !skip.has(src)});
  return dir;
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
// goFiles lists the .go files under dir, relative to it.
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
  return {exit:r.code, buildFailed, packages, passed:by('pass'), failed:by('fail'), skipped:by('skip'), stderr:r.err};
}
// suiteObservation is what the ordinary run of the suite shows: it passed, ran tests, skipped
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
  const files = {};
  for (const f of goFiles(path.join(tree, 'contract'))) files['contract/' + f] = fs.readFileSync(path.join(tree, 'contract', f), 'utf8');
  return suiteObservation(s, l.out.split('\n').filter(Boolean), files);
}
// uses runs the go/types observer on the packages in tree.
async function uses(tree, packages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k-contracts-loop-uses-'));
  fs.copyFileSync(path.join(__dirname, 'k_contracts_loop_uses.go.txt'), path.join(dir, 'main.go'));
  fs.writeFileSync(path.join(dir, 'go.mod'), 'module contractuses\n\ngo 1.27.2\n');
  const b = await run(go(), ['build', '-o', path.join(dir, 'uses'), '.'], dir);
  assert.equal(b.code, 0, 'building the usage observer: ' + b.err);
  const r = await run(path.join(dir, 'uses'), packages, tree);
  fs.rmSync(dir, {recursive:true, force:true});
  assert.equal(r.code, 0, 'usage observer on ' + packages.join(' ') + ': ' + r.err);
  return JSON.parse(r.out);
}
// readmeRows parses the contract/README.md table into rows of its four cells.
function readmeRows(text) {
  const lines = text.split('\n');
  const at = lines.indexOf(HEADER);
  assert.notEqual(at, -1, 'contract/README.md has no table headed ' + HEADER);
  const rows = [];
  for (const line of lines.slice(at + 2)) {
    if (!line.startsWith('|')) break;
    rows.push(line.replace(/^\|\s?/, '').replace(/\s?\|$/, '').split(' | ').map(c => c.trim()));
  }
  return rows;
}
const ticked = cell => cell.split(', ').map(s => (/^`([^`]+)`$/.exec(s) || [])[1]);
// inventoryObservation compares the inventory with the members the suite's files use and the
// README rows: every list is empty when they agree.
function inventoryObservation(inventory, used, rows, tests) {
  const seen = {}, o = {unused:[], missing_rows:[], extra_rows:[], duplicate_rows:[], wrong_consumers:[], bad_sources:[], unknown_tests:[]};
  for (const row of rows) {
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
  for (const k of Object.keys(o)) o[k] = [...new Set(o[k])].sort();
  return o;
}
// independence lists imports beyond the standard library (go/* excluded) and the five
// kogen-loop packages, and Go files with a string that starts with "..".
function independence(imports, files) {
  const foreign = imports.filter(i => {
    const first = i.split('/')[0];
    if (i.startsWith('kogen-loop/')) return !ALLOWED.includes(i) && !i.startsWith('kogen-loop/contract');
    return first.includes('.') || first === 'go';
  });
  const parent = Object.keys(files).filter(f => /["`]\.\.(?:[/"`])/.test(files[f])).sort();
  return {foreign_imports:foreign.sort(), parent_paths:parent};
}
// outcome runs the packages' tests in a fresh copy of the tree, after applying change when
// given: {file, from, to, count} replaces every occurrence of from, which must occur count times.
async function outcome(change, packages = ['./contract/...'], args = []) {
  const tree = copyTree();
  try {
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
    return 'contract passed';
  } finally {
    fs.rmSync(tree, {recursive:true, force:true});
  }
}
async function pool(items, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({length:Math.min(PARALLEL, items.length)}, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }));
  return results;
}
async function inventoryRun(inventory) {
  const tree = copyTree();
  try {
    const u = await uses(tree, ['./contract/...']);
    const l = await run(go(), ['test', '-list', '.', './contract/...'], tree);
    assert.equal(l.code, 0, 'go test -list . ./contract/...: ' + l.out + l.err);
    const tests = l.out.split('\n').filter(s => /^Test\w*$/.test(s));
    const readme = path.join(tree, 'contract', 'README.md');
    assert.ok(fs.existsSync(readme), 'contract/README.md is missing');
    return inventoryObservation(inventory, u.uses, readmeRows(fs.readFileSync(readme, 'utf8')), tests);
  } finally {
    fs.rmSync(tree, {recursive:true, force:true});
  }
}
async function independenceRun() {
  const tree = copyTree();
  try {
    const u = await uses(tree, ['./contract/...']);
    const files = {};
    for (const f of goFiles(path.join(tree, 'contract'))) files['contract/' + f] = fs.readFileSync(path.join(tree, 'contract', f), 'utf8');
    return {go_mod:fs.readFileSync(path.join(tree, 'go.mod'), 'utf8'), go_sum:fs.existsSync(path.join(tree, 'go.sum')), ...independence(u.imports, files)};
  } finally {
    fs.rmSync(tree, {recursive:true, force:true});
  }
}
function docs() {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const contract = path.join(ROOT, 'contract', 'README.md');
  return {
    readme_folder_map_row:/^\| `contract\/` \| .+ \|$/m.test(readme),
    readme_links_contract:readme.includes('](contract/)'),
    contract_readme_change_rule:fs.existsSync(contract) && fs.readFileSync(contract, 'utf8').includes(RULE),
  };
}

const CUT_TEST = ['-run', '^TestCutKeepsHeadAndTailAroundAMarker$'];
const CUT_HEAD = {file:'tools/tools.go', from:'defaultResultHead = 4096', to:'defaultResultHead = 2048', count:1};
// TEST_BREAK builds (go build skips test files) but breaks sys's tests, which go vet catches.
const TEST_BREAK = {file:'sys/sys_test.go', from:'func TestMain(m *testing.M) {', to:'func TestMain(m *testing.M) {\n\tundefinedContractControl()', count:1};
const GOOD_SUITE = {exit:0, build_failed:false, packages_not_passed:[], tests_failed:[], tests_skipped:[], ran_tests:true, packages_over_30_seconds:[], not_in_go_list_all:[], build_constraints:[]};
const EMPTY_INVENTORY = {unused:[], missing_rows:[], extra_rows:[], duplicate_rows:[], wrong_consumers:[], bad_sources:[], unknown_tests:[]};
const SAMPLE = {'sys.AsError':['kogen', 'kogen-build'], 'tools.Cut':['kogen-shaping'], 'provider.Client.Body':['kogen', 'kogen-build']};
const SAMPLE_README = [HEADER, '| --- | --- | --- | --- |',
  '| `sys.AsError` | kogen, kogen-build | `kogen/cli/main.go`, `kogen-build/build/unit_test.go` | `TestErrors` |',
  '| `tools.Cut` | kogen-shaping | `kogen-shaping/shape/window_test.go` | `TestCut`, `TestErrors` |',
  '| `provider.Client.Body` | kogen, kogen-build | `kogen-build/build/cache_id_test.go` | `TestBody` |', ''].join('\n');
// Each control case returns true when the observer accepted its input.
const CONTROLS = {
  good:[
    async () => { const t = copyTree(); try { return isDeepStrictEqual(await suite(t, ['./tools'], CUT_TEST), {...GOOD_SUITE, not_in_go_list_all:[]}); } finally { fs.rmSync(t, {recursive:true, force:true}); } },
    async () => (await outcome(null, ['./tools'], CUT_TEST)) === 'contract passed',
    async () => (await outcome(CUT_HEAD, ['./tools'], CUT_TEST)) === 'contract failed',
    async () => { const t = copyTree(); try { const u = await uses(t, ['./cmd/kogen-loop']); return u.uses.includes('api.DecodeTask') && u.uses.includes('loop.NewSession') && isDeepStrictEqual(independence(u.imports, {}), {foreign_imports:[], parent_paths:[]}); } finally { fs.rmSync(t, {recursive:true, force:true}); } },
    async () => isDeepStrictEqual(inventoryObservation(SAMPLE, Object.keys(SAMPLE), readmeRows(SAMPLE_README), ['TestErrors', 'TestCut', 'TestBody']), EMPTY_INVENTORY),
    async () => isDeepStrictEqual(independence(['testing', 'net/http/httptest', 'kogen-loop/sys', 'kogen-loop/tools'], {'contract/a_test.go':'p := filepath.Join(dir, "testdata", "x")'}), {foreign_imports:[], parent_paths:[]}),
  ],
  bad:[
    async () => { const t = copyTree(); try { fs.writeFileSync(path.join(t, 'tools', 'tools.go'), fs.readFileSync(path.join(t, 'tools', 'tools.go'), 'utf8').replace(CUT_HEAD.from, CUT_HEAD.to)); return isDeepStrictEqual(await suite(t, ['./tools'], CUT_TEST), GOOD_SUITE); } finally { fs.rmSync(t, {recursive:true, force:true}); } },
    async () => (await outcome({...CUT_HEAD, from:'defaultResultHead = 4097'}, ['./tools'], CUT_TEST)) === 'contract failed',
    async () => (await outcome(CUT_HEAD, ['./tools'], ['-run', '^NoSuchTest$'])) === 'contract failed',
    async () => (await outcome(TEST_BREAK, ['./tools'], CUT_TEST)) === 'contract passed',
    async () => isDeepStrictEqual(inventoryObservation(SAMPLE, ['sys.AsError', 'tools.Cut'], readmeRows(SAMPLE_README), ['TestErrors', 'TestCut', 'TestBody']), EMPTY_INVENTORY),
    async () => isDeepStrictEqual(inventoryObservation(SAMPLE, Object.keys(SAMPLE), readmeRows(SAMPLE_README.replace('| kogen-shaping |', '| kogen |')), ['TestErrors', 'TestCut', 'TestBody']), EMPTY_INVENTORY),
    async () => isDeepStrictEqual(inventoryObservation(SAMPLE, Object.keys(SAMPLE), readmeRows(SAMPLE_README.replace('`kogen-build/build/cache_id_test.go`', '`kogen-shaping/shape/x_test.go`')), ['TestErrors', 'TestCut', 'TestBody']), EMPTY_INVENTORY),
    async () => isDeepStrictEqual(inventoryObservation(SAMPLE, Object.keys(SAMPLE), readmeRows(SAMPLE_README), ['TestErrors', 'TestCut']), EMPTY_INVENTORY),
    async () => isDeepStrictEqual(inventoryObservation(SAMPLE, Object.keys(SAMPLE), readmeRows(SAMPLE_README.split('\n').filter(l => !l.includes('`tools.Cut`')).join('\n')), ['TestErrors', 'TestCut', 'TestBody']), EMPTY_INVENTORY),
    async () => isDeepStrictEqual(independence(['testing', 'github.com/KogenAI/kogen-build/build'], {}), {foreign_imports:[], parent_paths:[]}),
    async () => isDeepStrictEqual(independence(['testing', 'go/parser'], {}), {foreign_imports:[], parent_paths:[]}),
    async () => isDeepStrictEqual(independence(['testing'], {'contract/a_test.go':'os.ReadFile("../provider/wire.go")'}), {foreign_imports:[], parent_paths:[]}),
  ],
};

if (require.main === module) {
  const kind = process.argv[3];
  if (process.argv[2] !== '--control' || !(kind in CONTROLS)) {
    console.log('usage: k_contracts_loop.js --control good|bad'); process.exitCode = 2;
  } else {
    (async () => {
      const accepted = [];
      for (const c of CONTROLS[kind]) accepted.push(await c());
      if (kind === 'good' && accepted.every(Boolean)) console.log('contract suite observer accepted');
      else if (kind === 'bad' && !accepted.some(Boolean)) { console.log('contract suite observer rejected'); process.exitCode = 1; }
      else { console.log('contract suite observer control ' + kind + ' failed: ' + JSON.stringify(accepted)); process.exitCode = 3; }
    })().catch(e => { console.log('contract suite observer control error: ' + e.message); process.exitCode = 4; });
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  const json = s => JSON.parse(s);
  When('I run the kogen-loop contract suite offline', {timeout:600000}, async function () {
    const tree = copyTree();
    try { this.kclSuite = await suite(tree); } finally { fs.rmSync(tree, {recursive:true, force:true}); }
  });
  Then('the contract suite run observations are:', function (doc) {
    assert.deepEqual(this.kclSuite, json(doc), 'contract suite run ' + JSON.stringify(this.kclSuite));
  });
  Given('the kogen-loop members its consumers use are:', function (table) {
    this.kclInventory = Object.fromEntries(table.hashes().map(r => [r.member, r.consumers.split(', ')]));
  });
  When('I compare the contract suite and contract\\/README.md with that inventory', {timeout:600000}, async function () {
    this.kclInventoryObservation = await inventoryRun(this.kclInventory);
  });
  Then('the contract inventory observations are:', function (doc) {
    assert.deepEqual(this.kclInventoryObservation, json(doc), 'contract inventory ' + JSON.stringify(this.kclInventoryObservation));
  });
  When('I observe what the contract suite depends on', {timeout:600000}, async function () {
    this.kclIndependence = await independenceRun();
  });
  Then('the contract dependency observations are:', function (doc) {
    assert.deepEqual(this.kclIndependence, json(doc), 'contract dependencies ' + JSON.stringify(this.kclIndependence));
  });
  Given('these consumer-relied kogen-loop behaviour changes:', function (doc) {
    this.kclChanges = json(doc);
  });
  When('I run the contract suite on the unchanged tree and after each change', {timeout:1800000}, async function () {
    const cases = [{id:'unchanged', change:null}, ...this.kclChanges.map(c => ({id:c.id, change:c}))];
    const results = await pool(cases, c => outcome(c.change));
    this.kclOutcomes = Object.fromEntries(cases.map((c, i) => [c.id, results[i]]));
  });
  Then('the contract suite outcomes are:', function (doc) {
    assert.deepEqual(this.kclOutcomes, json(doc), 'contract suite outcomes ' + JSON.stringify(this.kclOutcomes));
  });
  When('I read the contract documentation', function () {
    this.kclDocs = docs();
  });
  Then('the contract documentation observations are:', function (doc) {
    assert.deepEqual(this.kclDocs, json(doc), 'contract documentation ' + JSON.stringify(this.kclDocs));
  });
}
