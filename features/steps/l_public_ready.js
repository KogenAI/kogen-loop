'use strict';
const {Then} = require('@cucumber/cucumber');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const read = p => fs.readFileSync(p, 'utf8');
Then('the public README contains each required item', function (input) {
  const text = read('README.md');
  for (const item of JSON.parse(input)) assert.ok(text.includes(item), `README missing ${item}`);
});
Then('the public README states the inquiry address exactly {int} time', function (count) {
  assert.equal(read('README.md').split('contact@kogen.dev').length - 1, count);
});
Then('tracked public documentation has no private identity or setup residues', function () {
  const files = execFileSync('git', ['ls-files', '-z'], {encoding:'utf8'}).split('\0').filter(Boolean);
  const patterns = [
    new RegExp('/' + '(?:Users|home)/[^\\s`"<>]+', 'i'),
    new RegExp('~/' + 'work\\.noindex/'),
    new RegExp('kogen-' + '(?:runner|macbook-runner|linux-macbook|bench-eu2)', 'i'),
    new RegExp('almir' + 'sarajcic', 'i'),
    new RegExp('GOPR' + 'IVATE|instead' + 'Of'),
    /contributions? (?:are |is )?not (?:accepted|welcome)/i
  ];
  for (const file of files) {
    if (!(file === 'README.md' || file.startsWith('docs/') || file.startsWith('.kogen/intents/'))) continue;
    const text = read(file);
    for (const pattern of patterns) assert.ok(!pattern.test(text), `${file}: private documentation residue ${pattern}`);
  }
});
Then('the public tree has none of these policy files', function (input) {
  const files = execFileSync('git', ['ls-files', '-z'], {encoding:'utf8'}).split('\0');
  for (const name of JSON.parse(input)) assert.ok(!files.some(p => p.split('/').at(-1).toLowerCase() === name.toLowerCase()), `unexpected ${name}`);
});
Then('the public historical audit contains each required item', function (input) {
  const text = read('docs/public-history-audit.md').toLowerCase();
  for (const item of JSON.parse(input)) assert.ok(text.includes(item), `historical audit missing ${item}`);
});
Then('the historical audit identifies at least one full commit', function () {
  assert.match(read('docs/public-history-audit.md'), /\b[0-9a-f]{40}\b/);
});
