'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const {Given, Then} = require('@cucumber/cucumber');

Given('document-search-nul-contract: the caller contract is available', function () {
  this.nulContract = fs.readFileSync('docs/contract/loop-v1.md', 'utf8');
  this.searchPassage = this.nulContract.split('\n\n').find(p => p.startsWith('**Printed paths.**'));
  assert.ok(this.searchPassage, 'caller contract must contain the Printed paths passage');
});

Then('document-search-nul-contract: it documents NUL refusal with error {string} and classification {string}', function (error, classification) {
  const sentences = this.searchPassage.split(/\. (?=[A-Z`])/);
  assert.ok(sentences.some(s => /search_text/.test(s) && /NUL/.test(s) && /\b(refus\w*|reject\w*)\b/i.test(s) && s.includes(error) && s.includes('`' + classification + '`')),
    'search_text passage must describe NUL refusal with error ' + error + ' and classification ' + classification);
});

Then('document-search-nul-contract: it does not claim patterns are cut at the first NUL', function () {
  assert.doesNotMatch(this.searchPassage, /(?:cut|truncat)\w*[^.]*first NUL|first NUL[^.]*(?:cut|truncat)\w*/i,
    'remove the obsolete first-NUL pattern truncation claim');
});

Then('document-search-nul-contract: the error kind table includes NUL patterns under {string}', function (classification) {
  const row = this.nulContract.split('\n').find(line => line.startsWith('| `' + classification + '` |'));
  assert.ok(row && /search_text/.test(row) && /pattern/.test(row) && /NUL/.test(row),
    'error_kind table must include NUL search_text patterns under ' + classification);
});

Then('document-search-nul-contract: it preserves these search claims', function (claims) {
  for (const claim of claims.split('\n').map(s => s.trim()).filter(Boolean)) {
    assert.ok(this.searchPassage.includes(claim), 'preserve documented search claim: ' + claim);
  }
});
