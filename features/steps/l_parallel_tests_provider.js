'use strict';
const assert = require('node:assert/strict');
function parallel(events) {
  return events.some(e => e.Action === 'pause' && e.Test) && events.some(e => e.Action === 'cont' && e.Test);
}
if (require.main === module) {
  const events = process.argv[2] === 'good' ? [{Action:'pause',Test:'TestFixture'}, {Action:'cont',Test:'TestFixture'}] : [{Action:'pass',Test:'TestFixture'}];
  const ok = parallel(events);
  console.log(ok ? 'parallel observed' : 'parallel missing');
  process.exitCode = ok ? 0 : 1;
} else {
  const { When, Then } = require('@cucumber/cucumber');
  const { spawnSync } = require('node:child_process');
  When('I execute the uncached provider parallel suite', {timeout:300000}, function () {
    this.providerParallel = spawnSync('go', ['test','-json','-count=1','./provider'], {encoding:'utf8',timeout:290000,maxBuffer:32*1024*1024});
  });
  Then('the provider suite passes with default parallel scheduling', function () {
    const r = this.providerParallel;
    assert.ok(r && !r.error, 'go test -json -count=1 ./provider failed to execute: ' + String(r && r.error));
    assert.equal(r.status, 0, 'go test -json -count=1 ./provider failed\n' + r.stdout + r.stderr);
    const events = r.stdout.split('\n').filter(Boolean).map(s => JSON.parse(s));
    assert.ok(events.some(e => e.Package === 'github.com/KogenAI/kogen-loop/provider' && !e.Test && e.Action === 'pass'), 'go test ./provider package result missing');
    assert.ok(parallel(events), 'go test ./provider: independent tests never paused and continued for parallel scheduling');
  });
}
