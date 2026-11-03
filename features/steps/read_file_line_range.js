'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');

// Runs read_file calls with raw JSON arguments through tools.Tools.CallClassified (the path
// a model's function call takes, DecodeArguments included) on a temporary root.
const driver = 'features/steps/read_file_line_range_driver.go';
const fixture = {'a.txt': 'one\ntwo\nthree\n', 'e.txt': ''};

function readFile(files, raw) {
  const input = JSON.stringify({files, calls: [raw]});
  const r = spawnSync('go', ['run', driver], {input, encoding: 'utf8', timeout: 170000});
  assert.equal(r.status, 0, `go run ${driver} for read_file ${raw} exited ${r.status}\n${r.stdout}${r.stderr}`);
  const results = JSON.parse(r.stdout);
  assert.equal(results.length, 1, `go run ${driver}: one result expected for read_file ${raw}: ${r.stdout}`);
  assert.equal(results[0].error, '', `read_file ${raw} returned a Go error: ${results[0].error}`);
  return results[0];
}

function checkText(result, raw, want) {
  assert.equal(result.text, want, `read_file ${raw}: text`);
}

function checkMalformed(result, raw, cls) {
  assert.equal(result.malformed_class, cls, `read_file ${raw}: malformed_class of ${JSON.stringify(result.text)}`);
  assert.equal(result.error_kind, '', `read_file ${raw}: error_kind of ${JSON.stringify(result.text)}`);
}

function checkNoClass(result, raw) {
  assert.equal(result.malformed_class, '', `read_file ${raw}: malformed_class of ${JSON.stringify(result.text)}`);
  assert.equal(result.error_kind, '', `read_file ${raw}: error_kind of ${JSON.stringify(result.text)}`);
}

if (require.main === module) {
  // Observer controls on behavior the request leaves unchanged: real driver results.
  const range = '{"path":"a.txt","start_line":2}', empty = '{"path":"e.txt"}', noPath = '{"start_line":2}';
  const r = readFile(fixture, range), e = readFile(fixture, empty), p = readFile(fixture, noPath);
  if (process.argv[2] === 'good') {
    checkText(r, range, '2\ttwo\n3\tthree'); checkNoClass(r, range);
    checkText(e, empty, ''); checkNoClass(e, empty);
    checkText(p, noPath, 'error: argument path must be a string'); checkMalformed(p, noPath, 'missing_argument');
    console.log('observer good');
  } else {
    const tests = [
      () => checkText(r, range, '2\ttwo'),
      () => checkText(e, empty, '(start_line 1 is past the end of e.txt; line count: 0)'),
      () => checkText(p, noPath, 'error: argument start_line must be an integer'),
      () => checkNoClass(p, noPath),
      () => checkMalformed(r, range, 'wrong_argument_type'),
      () => checkMalformed(p, noPath, 'wrong_argument_type'),
      () => checkMalformed({...p, error_kind: 'file_error'}, noPath, 'missing_argument'),
      () => checkNoClass({...r, error_kind: 'not_found'}, range),
    ];
    for (const test of tests) assert.throws(test);
    console.log('observer bad rejected'); process.exitCode = 1;
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  Given('the read_file line-range files: a.txt holding one, two, three and an empty e.txt', function () {
    this.readFileFiles = fixture;
  });
  When('read_file is called with the arguments {string}', {timeout: 180000}, function (raw) {
    assert.ok(this.readFileFiles, 'the read_file line-range files must be given first');
    this.readFileArguments = raw;
    this.readFileResult = readFile(this.readFileFiles, raw);
  });
  // expected is the body of a JSON string literal: \t and \n stand for a tab and a newline.
  Then('the read_file text is {string}', function (expected) {
    checkText(this.readFileResult, this.readFileArguments, JSON.parse('"' + expected + '"'));
  });
  Then('the read_file text is empty', function () {
    checkText(this.readFileResult, this.readFileArguments, '');
  });
  Then('the read_file call is malformed with class {string}', function (cls) {
    checkMalformed(this.readFileResult, this.readFileArguments, cls);
  });
  Then('the read_file call carries no error class', function () {
    checkNoClass(this.readFileResult, this.readFileArguments);
  });
}
