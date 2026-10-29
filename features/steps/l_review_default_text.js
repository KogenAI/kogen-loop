'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {When, Then} = require('@cucumber/cucumber');

When('I read the L review default public provider text', {timeout: 120000}, function () {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'l-review-default-'));
  try {
    const source = path.join(dir, 'main.go');
    const binary = path.join(dir, 'listing');
    fs.writeFileSync(source, 'package main\nimport ("fmt"; "kogen-loop/provider")\nfunc main() { fmt.Print(provider.OfficialText()) }\n');
    const build = spawnSync('go', ['build', '-o', binary, source], {encoding: 'utf8', timeout: 100000});
    assert.equal(build.status, 0, 'go build public provider text consumer failed: ' + build.error + '\n' + build.stdout + build.stderr);
    const result = spawnSync(binary, [], {encoding: 'utf8', timeout: 10000});
    assert.equal(result.status, 0, 'public provider text consumer failed: ' + result.error + '\n' + result.stdout + result.stderr);
    this.lReviewDefaultText = result.stdout;
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
Then('the L review default recommendation line is exactly', function (expected) {
  const lines = this.lReviewDefaultText.split('\n').filter(line => line.startsWith('Recommended ChatGPT defaults:'));
  assert.deepEqual(lines, [expected]);
});
