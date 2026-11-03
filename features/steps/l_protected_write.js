'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function compare(actual, expected) { assert.deepStrictEqual(actual, expected); }
if (require.main === module) {
  const expected = {text:'refused: checks/accept.txt is part of the approved acceptance baseline',kind:'protected',content:'keep',exists:true,links:{'shortcut.txt':'checks/accept.txt'},mode:'-rw-r-----'};
  const actual = JSON.parse(JSON.stringify(expected));
  if (process.argv[2] === 'bad') { actual.content = 'replace'; actual.links = {}; }
  try { compare(actual, expected); console.log('accepted'); } catch (_) { console.log('rejected'); process.exitCode = 1; }
} else {
  const {When,Then} = require('@cucumber/cucumber');
  When('I exercise protected write case {string}', {timeout:120000}, function(name) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'pw-build-'));
    try {
      const bin = path.join(dir,'driver');
      const build = spawnSync('go',['build','-o',bin,'features/steps/l_protected_write_driver.go'],{encoding:'utf8',timeout:110000});
      assert.equal(build.status,0,'go build protected write driver\n'+build.stdout+build.stderr);
      const r = spawnSync(bin,[name],{encoding:'utf8',timeout:10000});
      assert.equal(r.status,0,'protected write driver '+name+'\n'+r.stdout+r.stderr);
      this.protectedWrite = JSON.parse(r.stdout);
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
  });
  Then('the protected write snapshot is:', function(doc) { compare(this.protectedWrite,JSON.parse(doc)); });
}
