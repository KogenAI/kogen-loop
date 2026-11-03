'use strict';
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
function fixture(kind) {
  if (kind === 'lines') return ('x'.repeat(79)+'\n').repeat(500);
  if (kind === 'numbered') return Array.from({length:500},(_,i)=>`${i+1}\t${'x'.repeat(72)}\n`).join('');
  if (kind === 'single') return 'x'.repeat(30000);
  if (kind === 'unicode') return '€'.repeat(10000);
  return 'x'.repeat(Number(kind));
}
function check(text, result, aligned) {
  const [cut, twice] = result;
  assert.equal(twice, cut, 'idempotence');
  assert.ok(Buffer.byteLength(cut)<=16384, 'byte bound');
  assert.ok(!cut.includes('\ufffd'), 'valid UTF-8 input must not lose characters');
  if (Buffer.byteLength(text)<=16384) { assert.equal(cut,text); return; }
  const m = /\n\[\.\.\. (\d+) bytes omitted \.\.\.\]\n/.exec(cut);
  assert.ok(m, 'omission marker');
  const head = cut.slice(0,m.index), tail = cut.slice(m.index+m[0].length);
  assert.ok(head.length>0 && tail.length>0, 'both ends retained');
  assert.ok(text.startsWith(head) && text.endsWith(tail), 'exact prefix and suffix');
  assert.equal(Number(m[1]), Buffer.byteLength(text)-Buffer.byteLength(head)-Buffer.byteLength(tail), 'actual absent bytes');
  assert.ok(Buffer.byteLength(head)<=4096, 'head budget');
  if (aligned) {
    assert.equal(head, text.slice(0,text.lastIndexOf('\n',4095)+1), 'last complete head line');
    assert.ok(head.endsWith('\n'), 'head line ending');
    assert.equal(text[text.length-tail.length-1], '\n', 'tail starts at line boundary');
  } else assert.equal(Buffer.byteLength(head), text[0]==='€'?4095:4096, 'long-line byte fallback');
}
if (require.main === module) {
  const text = fixture('lines');
  const head = text.slice(0,4080), tail = text.slice(32000);
  const cut = head+'\n[... '+(40000-4080-8000)+' bytes omitted ...]\n'+tail;
  if (process.argv[2]==='good') { check(text,[cut,cut],true); console.log('observer good'); }
  else {
    const tests = [()=>check(text,[cut,cut+'!'],true),()=>check(text,[cut.replace('27920','1'),cut.replace('27920','1')],true),()=>check(text,[text,text],true),()=>check(text,[cut.replace(head,head.slice(0,-1)),cut.replace(head,head.slice(0,-1))],true)];
    for (const test of tests) assert.throws(test);
    console.log('observer bad rejected'); process.exitCode=1;
  }
} else {
  const {When,Then} = require('@cucumber/cucumber');
  When('I cut the line-alignment fixture {string}', {timeout:120000}, function(kind) {
    this.lineKind=kind; this.lineText=fixture(kind);
    const r=spawnSync('go',['run','features/steps/l_line_cut_driver.go'],{input:JSON.stringify(this.lineText),encoding:'utf8',timeout:110000});
    assert.equal(r.status,0,r.stdout+r.stderr); this.lineResult=JSON.parse(r.stdout);
  });
  Then('the line-alignment result satisfies the byte and line contract',function(){check(this.lineText,this.lineResult,['lines','numbered'].includes(this.lineKind));});
  When('I run the existing escaped shell envelope regression', {timeout:120000}, function(){this.lineShell=spawnSync('go',['test','./tools','-run','^TestShellYieldLargeJSON$','-count=1'],{encoding:'utf8',timeout:110000});});
  Then('the escaped shell envelope regression passes',function(){const r=this.lineShell;assert.equal(r.status,0,'go test ./tools -run ^TestShellYieldLargeJSON$ -count=1\n'+r.stdout+r.stderr);assert.match(r.stdout,/ok\s+kogen-loop\/tools\s+/, 'TestShellYieldLargeJSON must run via go test ./tools');});
}
