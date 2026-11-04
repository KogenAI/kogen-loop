'use strict';
// Acceptance driver of l-write-link-parent-traversal: it builds a small Go program that lays
// out a disposable fixture (a workspace root, an outside folder and a home folder), runs the
// real native write_file tool (tools.Tools.RunClassified) with one path argument and the
// content "written", optionally runs read_file on the same path text, and reports the tool
// texts, the error kind and the state of named paths (file content, "<dir>", "<link>" or null
// when absent). HOME is the home folder while the tools run.
// Fixture and observed paths are relative to the workspace root unless they start with
// $ROOT, $OUT or $HOME, which name the three folders.
// `node features/steps/l-write-link-parent-traversal__write.js good|bad` checks the observer
// with the real driver on a case today's write_file already handles (a/../b.txt).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const SOURCE = `package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"

	"github.com/KogenAI/kogen-loop/tools"
)

type fixture struct {
	Dirs      []string          \`json:"dirs"\`
	Files     map[string]string \`json:"files"\`
	Links     [][2]string       \`json:"links"\`
	Protected []string          \`json:"protected"\`
	Path      string            \`json:"path"\`
	Read      bool              \`json:"read"\`
	Observe   []string          \`json:"observe"\`
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func main() {
	var f fixture
	must(json.NewDecoder(os.Stdin).Decode(&f))
	base := os.Args[1]
	root, out, home := filepath.Join(base, "root"), filepath.Join(base, "out"), filepath.Join(base, "home")
	vars := strings.NewReplacer("$ROOT", root, "$OUT", out, "$HOME", home)
	place := func(p string) string {
		p = vars.Replace(p)
		if filepath.IsAbs(p) {
			return p
		}
		return filepath.Join(root, p)
	}
	for _, d := range []string{root, out, home} {
		must(os.MkdirAll(d, 0o755))
	}
	must(os.Setenv("HOME", home))
	for _, d := range f.Dirs {
		must(os.MkdirAll(place(d), 0o755))
	}
	for p, c := range f.Files {
		must(os.WriteFile(place(p), []byte(c), 0o644))
	}
	for _, l := range f.Links {
		must(os.Symlink(vars.Replace(l[1]), place(l[0])))
	}
	t := &tools.Tools{Root: root, Enabled: []string{tools.WriteFileTool, tools.ReadFileTool}, Protected: f.Protected}
	arg := vars.Replace(f.Path)
	res, err := t.RunClassified(context.Background(), tools.WriteFileTool, map[string]any{"path": arg, "content": "written"})
	must(err)
	report := map[string]any{"text": res.Text, "kind": res.ErrorKind}
	if f.Read {
		read, err := t.RunClassified(context.Background(), tools.ReadFileTool, map[string]any{"path": arg})
		must(err)
		report["read"] = read.Text
	}
	files := map[string]any{}
	for _, p := range f.Observe {
		st, err := os.Lstat(place(p))
		switch {
		case os.IsNotExist(err):
			files[p] = nil
		case err != nil:
			panic(err)
		case st.Mode()&os.ModeSymlink != 0:
			files[p] = "<link>"
		case st.IsDir():
			files[p] = "<dir>"
		default:
			data, err := os.ReadFile(place(p))
			must(err)
			files[p] = string(data)
		}
	}
	report["files"] = files
	must(json.NewEncoder(os.Stdout).Encode(report))
}
`;

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, {encoding:'utf8', timeout:110000, ...opts});
  assert.ok(!r.error, cmd + ' ' + args.join(' ') + ': ' + (r.error && r.error.message));
  assert.equal(r.status, 0, cmd + ' ' + args.join(' ') + ' exited ' + r.status + '\n' + r.stdout + r.stderr);
  return r.stdout;
}

// exercise builds the driver, runs one fixture case and returns its report.
function exercise(fixture) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'write-link-parent-'));
  try {
    const file = path.join(tmp, 'main.go');
    fs.writeFileSync(file, SOURCE);
    const bin = path.join(tmp, 'driver');
    run('go', ['build', '-o', bin, file]);
    const base = path.join(tmp, 'case');
    fs.mkdirSync(base);
    const r = spawnSync(bin, [base], {input:JSON.stringify(fixture), encoding:'utf8', timeout:20000});
    assert.ok(!r.error, 'write_file driver for path ' + JSON.stringify(fixture.path) + ' did not finish within 20 s: ' + (r.error && r.error.message));
    assert.equal(r.status, 0, 'write_file driver for path ' + JSON.stringify(fixture.path) + ' exited ' + r.status + '\n' + r.stdout + r.stderr);
    return JSON.parse(r.stdout);
  } finally {
    fs.rmSync(tmp, {recursive:true, force:true});
  }
}

if (require.main === module) {
  const fixture = {dirs:[], files:{}, links:[], protected:[], path:'a/../b.txt', read:false, observe:['b.txt', 'a']};
  const good = {text:'ok', kind:'', files:{'b.txt':'written', 'a':null}};
  const bad = {text:'ok', kind:'', files:{'b.txt':null, 'a':'<dir>'}};
  const actual = exercise(fixture);
  try {
    assert.deepStrictEqual(actual, process.argv[2] === 'bad' ? bad : good);
    console.log('accepted');
  } catch (_) {
    console.log('rejected');
    process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('l-write-link-parent-traversal: write_file runs on the fixture:', {timeout:120000}, function(doc) {
    const fixture = {dirs:[], files:{}, links:[], protected:[], read:false, observe:[], ...JSON.parse(doc)};
    assert.equal(typeof fixture.path, 'string', 'the fixture names the write_file path argument');
    this.writeLinkParent = exercise(fixture);
  });
  Then('l-write-link-parent-traversal: the outcome is:', function(doc) {
    assert.deepStrictEqual(this.writeLinkParent, JSON.parse(doc));
  });
}
