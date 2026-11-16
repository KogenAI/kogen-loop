'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then, AfterAll} = require('@cucumber/cucumber');
const prefix = 'kogen-loop-unavailable-names-earlier-attempts: ';

const probe = `package provider

import (
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

func TestKogenEarlierAttemptsProbe(t *testing.T) {
	var script []handler
	switch os.Getenv("KOGEN_EARLIER_SCENARIO") {
	case "three-different":
		script = []handler{limited(429), jsonAnswer(503, map[string]any{"error": map[string]any{"message": "overloaded"}}), limited(502)}
	case "identical":
		script = []handler{limited(429), limited(429), limited(429)}
	case "retry-after-bound":
		script = []handler{limited(429), limited(503, "90"), textAnswer("done")}
	default:
		t.Fatal("unknown scenario")
	}
	e, f := chatEnv(t, script...)
	_, err := e.respond(Request{Input: user("x")})
	se := mustErr(t, err)
	out, _ := json.Marshal(map[string]any{"class": se.Class, "reason": se.Reason, "detail": se.Detail, "lines": se.Lines, "exit": se.Exit, "requests": len(f.requests()), "slept": e.clk.slept()})
	fmt.Println("KOGEN_EARLIER_RESULT " + string(out))
}
`;

let directory;

Given(prefix + 'the provider package is copied to a scratch module', {timeout: 60000}, function () {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kogen-loop-earlier-'));
  this.scratch = path.join(directory, 'module');
  fs.mkdirSync(this.scratch);
  const copy = spawnSync('sh', ['-c', 'tar --exclude=.git --exclude=.kogen -cf - . | tar -xf - -C "$1"', 'sh', this.scratch], {encoding: 'utf8', timeout: 50000});
  assert.ifError(copy.error);
  assert.equal(copy.status, 0, 'copy failed: ' + copy.stderr);
  fs.writeFileSync(path.join(this.scratch, 'provider', 'zz_kogen_earlier_probe_test.go'), probe);
});

When(prefix + 'the ChatGPT route answers with the script {string}', {timeout: 115000}, function (name) {
  const result = spawnSync('go', ['test', './provider', '-run', '^TestKogenEarlierAttemptsProbe$', '-count=1', '-v'], {
    cwd: this.scratch, encoding: 'utf8', timeout: 110000,
    env: {...process.env, KOGEN_EARLIER_SCENARIO: name},
  });
  assert.ifError(result.error);
  const line = result.stdout.split('\n').find(l => l.startsWith('KOGEN_EARLIER_RESULT '));
  assert.ok(line, 'no result line from go test ./provider -run TestKogenEarlierAttemptsProbe (exit ' + result.status + '): ' + result.stdout + result.stderr);
  this.outcome = JSON.parse(line.slice('KOGEN_EARLIER_RESULT '.length));
});

Then(prefix + 'the call ended as unavailable with detail {string}', function (detail) {
  assert.equal(this.outcome.class, 'provider');
  assert.equal(this.outcome.reason, 'unavailable');
  assert.equal(this.outcome.exit, 4);
  assert.equal(this.outcome.detail, detail);
});

Then(prefix + '{int} requests were made and the waits were {int} s then {int} s', function (requests, a, b) {
  assert.equal(this.outcome.requests, requests);
  assert.deepEqual(this.outcome.slept, [a * 1e9, b * 1e9]);
});

Then(prefix + '{int} requests were made and the waits were {int} s', function (requests, a) {
  assert.equal(this.outcome.requests, requests);
  assert.deepEqual(this.outcome.slept, [a * 1e9]);
});

Then(prefix + 'the error lines contain {string}', function (line) {
  assert.ok(this.outcome.lines.includes(line), 'lines ' + JSON.stringify(this.outcome.lines) + ' do not contain ' + JSON.stringify(line));
});

Then(prefix + 'no error line starts with {string}', function (start) {
  const hit = this.outcome.lines.filter(l => l.startsWith(start));
  assert.deepEqual(hit, [], 'lines ' + JSON.stringify(this.outcome.lines));
});

Then(prefix + 'the error lines are exactly {int}', function (count) {
  assert.equal(this.outcome.lines.length, count, 'lines ' + JSON.stringify(this.outcome.lines));
});

AfterAll(function () {
  if (directory) {
    fs.rmSync(directory, {recursive: true, force: true});
  }
});
