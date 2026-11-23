'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {Given, When, Then} = require('@cucumber/cucumber');
const prefix = 'task-decode-strict-fields: ';

const fields = ['protocol', 'root', 'role', 'instructions', 'prompt', 'tools', 'protected', 'excluded',
  'terminal', 'deadline_seconds', 'session', 'requires'];

const variants = {
  // Unknown fields are silently dropped.
  'drop-unknown': {
    edit: src => replaceOnce(src, '\tdec.DisallowUnknownFields()\n', ''),
  },
  // Unknown fields are rejected, but the error does not say which field.
  'unnamed-error': {
    edit: src => replaceOnce(src, 'fmt.Errorf("invalid task: %w", err)', 'fmt.Errorf("invalid task: rejected")'),
  },
  // Only top-level fields are checked; nested unknown fields are accepted.
  'top-level-only': {
    edit: src => replaceOnce(src, '\tdec.DisallowUnknownFields()\n',
      '\tif err := topLevelOnly(data); err != nil {\n\t\treturn Task{}, fmt.Errorf("invalid task: %w", err)\n\t}\n'),
    extra: 'package api\n\nimport (\n\t"encoding/json"\n\t"fmt"\n)\n\nfunc topLevelOnly(data []byte) error {\n\tvar m map[string]json.RawMessage\n\tif err := json.Unmarshal(data, &m); err != nil {\n\t\treturn err\n\t}\n\tknown := map[string]bool{' +
      fields.map(f => '"' + f + '": true').join(', ') +
      '}\n\tfor k := range m {\n\t\tif !known[k] {\n\t\t\treturn fmt.Errorf("json: unknown field %q", k)\n\t\t}\n\t}\n\treturn nil\n}\n',
  },
  // Every nested field is rejected, known or not; the error names all of the nested fields, so only the valid-task check can tell it apart.
  'reject-nested': {
    edit: src => replaceOnce(src, '\tdec.DisallowUnknownFields()\n',
      '\tdec.DisallowUnknownFields()\n\tif err := noNested(data); err != nil {\n\t\treturn Task{}, fmt.Errorf("invalid task: %w", err)\n\t}\n'),
    extra: 'package api\n\nimport (\n\t"encoding/json"\n\t"fmt"\n)\n\nfunc noNested(data []byte) error {\n\tvar m map[string]json.RawMessage\n\tif err := json.Unmarshal(data, &m); err != nil {\n\t\treturn err\n\t}\n\tfor _, k := range []string{"role", "session"} {\n\t\tvar n map[string]json.RawMessage\n\t\tif err := json.Unmarshal(m[k], &n); err == nil && len(n) > 0 {\n\t\t\tmsg := "json: unknown fields"\n\t\t\tfor f := range n {\n\t\t\t\tmsg += fmt.Sprintf(" %q", f)\n\t\t\t}\n\t\t\treturn fmt.Errorf("%s", msg)\n\t\t}\n\t}\n\treturn nil\n}\n',
  },
};

function replaceOnce(src, from, to) {
  assert.equal(src.split(from).length, 2, 'anchor not found exactly once in api.go: ' + JSON.stringify(from));
  return src.replace(from, () => to);
}

function goTest(dir) {
  const result = spawnSync('go', ['test', './api', '-count=1'], {cwd: dir, encoding: 'utf8', timeout: 100000});
  assert.ifError(result.error);
  return {status: result.status, output: result.stdout + result.stderr};
}

Given(prefix + 'the api package is copied from this checkout and its tests pass on the real DecodeTask', {timeout: 115000}, function () {
  this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'strict-fields-'));
  fs.copyFileSync('go.mod', path.join(this.dir, 'go.mod'));
  fs.mkdirSync(path.join(this.dir, 'api'));
  for (const name of fs.readdirSync('api')) {
    if (name.endsWith('.go')) {
      fs.copyFileSync(path.join('api', name), path.join(this.dir, 'api', name));
    }
  }
  const real = goTest(this.dir);
  assert.equal(real.status, 0, 'go test ./api on the real DecodeTask failed:\n' + real.output);
});

When(prefix + 'DecodeTask is replaced by the variant {string}', function (name) {
  const variant = variants[name];
  assert.ok(variant, 'unknown variant ' + name);
  const file = path.join(this.dir, 'api', 'api.go');
  fs.writeFileSync(file, variant.edit(fs.readFileSync(file, 'utf8')));
  if (variant.extra) {
    fs.writeFileSync(path.join(this.dir, 'api', 'variant.go'), variant.extra);
  }
  this.variant = name;
  this.result = goTest(this.dir);
});

Then(prefix + 'the api tests fail with a test assertion', function () {
  const {status, output} = this.result;
  assert.ok(!/\[build failed\]|\[setup failed\]/.test(output), 'variant ' + this.variant + ' did not compile:\n' + output);
  assert.notEqual(status, 0, 'go test ./api passed with DecodeTask variant ' + this.variant + ', so the tests do not pin it:\n' + output);
  assert.ok(/--- FAIL: /.test(output), 'go test ./api failed without a test failure for variant ' + this.variant + ':\n' + output);
});
