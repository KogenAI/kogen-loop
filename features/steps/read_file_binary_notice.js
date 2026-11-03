'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');

const DRIVER = 'features/steps/read_file_binary_notice_driver.go';
let driverBinary;

// driver is the read_file_binary_notice driver, built once per process.
function driver() {
  if (!driverBinary) {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rfbn-driver-')), 'driver');
    const r = spawnSync('go', ['build', '-o', out, DRIVER], {encoding: 'utf8', timeout: 170000});
    assert.equal(r.status, 0, 'go build -o ' + out + ' ' + DRIVER + ': ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + r.stdout + r.stderr);
    driverBinary = out;
  }
  return driverBinary;
}

function newRoot() {
  return fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rfbn-root-')));
}

function hex(text) {
  assert.match(text, /^([0-9a-f]{2})*$/, 'hex bytes');
  return Buffer.from(text, 'hex');
}

function crc32(bytes) {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// png is a 1x1 static non-interlaced RGB8 PNG (a green pixel) whose IDAT holds one stored
// (uncompressed) deflate block, so its bytes do not depend on a zlib build: 72 bytes.
function png() {
  const raw = Buffer.from([0, 0, 255, 0]);
  let a = 1, b = 0;
  for (const x of raw) { a = (a + x) % 65521; b = (b + a) % 65521; }
  const adler = Buffer.alloc(4);
  adler.writeUInt32BE(((b << 16) | a) >>> 0);
  const zlib = Buffer.concat([Buffer.from([0x78, 0x01, 0x01, 0x04, 0x00, 0xfb, 0xff]), raw, adler]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
    chunk('IDAT', zlib),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// call runs one tool call in root through the driver: the result as the loop delivers it.
function call(root, tool, args) {
  const name = tool + ' ' + args;
  const r = spawnSync(driver(), [root, tool, args], {encoding: 'utf8', timeout: 60000, maxBuffer: 16 * 1024 * 1024});
  assert.equal(r.status, 0, name + ': driver ' + (r.error ? r.error.message : 'exit ' + r.status) + '\n' + r.stdout + r.stderr);
  const out = JSON.parse(r.stdout);
  return {...out, call: name, text: Buffer.from(out.text_base64, 'base64')};
}

function context(r) {
  return r.call + ' -> ' + JSON.stringify({typed: r.typed, error_kind: r.error_kind, malformed_class: r.malformed_class, part_types: r.part_types, text: r.text.toString('utf8')});
}

function jsonString(doc) {
  const text = JSON.parse(doc);
  assert.equal(typeof text, 'string', 'the docstring must be one JSON string');
  return text;
}

const check = {
  nonErrorText(r) {
    assert.equal(r.typed, false, context(r));
    assert.equal(r.error_kind, '', context(r));
    assert.equal(r.malformed_class, '', context(r));
  },
  exactly(r, want) {
    assert.deepEqual(r.text, Buffer.from(want, 'utf8'), context(r));
  },
  noNulNoReplacement(r) {
    assert.ok(!r.text.includes(0), 'NUL byte: ' + context(r));
    assert.ok(!r.text.toString('utf8').includes('�'), 'replacement character: ' + context(r));
  },
  atMost(r, n) {
    assert.ok(r.text.length <= n, r.text.length + ' bytes: ' + context(r).slice(0, 2000));
  },
  startsWithLines(r, n, line) {
    const want = Array.from({length: n}, (_, i) => (i + 1) + '\t' + line + '\n').join('');
    assert.equal(r.text.toString('utf8').slice(0, want.length), want, context(r).slice(0, 2000));
  },
  contains(r, part) {
    assert.ok(r.text.toString('utf8').includes(part), context(r).slice(0, 2000));
  },
  endsWithLine(r, n, line) {
    assert.ok(r.text.toString('utf8').endsWith('\n' + n + '\t' + line), context(r).slice(-2000));
  },
  typedParts(r, types) {
    assert.equal(r.typed, true, context(r));
    assert.equal(r.error_kind, '', context(r));
    assert.deepEqual(r.part_types, types.split(','), context(r));
  },
};

if (require.main === module) {
  // Observer controls: good runs the driver on behaviour that holds before and after the
  // change and the checks on a well-formed notice; bad feeds the checks known-wrong results.
  const notice = 'blob.bin: binary file, 6 bytes (contains a NUL byte or is not valid UTF-8); content not shown';
  const synthetic = (text, extra = {}) => ({call: 'synthetic', typed: false, error_kind: '', malformed_class: '', part_types: [], text: Buffer.from(text, 'latin1'), ...extra});
  if (process.argv[2] === 'good') {
    const root = newRoot();
    fs.writeFileSync(path.join(root, 'crlf.txt'), 'one\r\ntwo\r\nthree');
    fs.writeFileSync(path.join(root, 'pixel.png'), png());
    let r = call(root, 'read_file', '{"path":"crlf.txt"}');
    check.nonErrorText(r); check.exactly(r, '1\tone\r\n2\ttwo\r\n3\tthree'); check.noNulNoReplacement(r);
    r = call(root, 'read_file', '{"path":"crlf.txt","start_line":2,"end_line":2}');
    check.nonErrorText(r); check.exactly(r, '2\ttwo\r');
    r = call(root, 'view_image', '{"path":"pixel.png"}');
    check.typedParts(r, 'input_text,input_image');
    r = synthetic(notice);
    check.nonErrorText(r); check.exactly(r, notice); check.noNulNoReplacement(r); check.atMost(r, 16384);
    console.log('observer good');
  } else {
    const bad = [
      () => check.exactly(synthetic('1\ta\x00b\xef\xbf\xbd\xef\xbf\xbdc'), notice),
      () => check.noNulNoReplacement(synthetic('1\ta\x00bc')),
      () => check.noNulNoReplacement(synthetic(Buffer.from('1\tcaf�', 'utf8').toString('latin1'))),
      () => check.nonErrorText(synthetic(notice, {error_kind: 'file_error'})),
      () => check.nonErrorText(synthetic(notice, {typed: true})),
      () => check.exactly(synthetic(notice + '\n'), notice),
      () => check.typedParts(synthetic(notice), 'input_text,input_image'),
      () => check.endsWithLine(synthetic('1\tx\n2\tx'), 3, 'x'),
    ];
    for (const test of bad) assert.throws(test);
    console.log('observer bad rejected');
    process.exitCode = 1;
  }
} else {
  const {Given, When, Then} = require('@cucumber/cucumber');
  const root = world => (world.rfbnRoot ??= newRoot());
  const fixture = (world, name, bytes) => fs.writeFileSync(path.join(root(world), name), bytes);
  const result = world => {
    assert.ok(world.rfbnResult, 'no tool call ran');
    return world.rfbnResult;
  };

  Given('a read_file fixture {string} with the hex bytes {string}', function(name, bytes) {
    fixture(this, name, hex(bytes));
  });
  Given('a read_file fixture {string} containing the JSON string:', function(name, doc) {
    fixture(this, name, Buffer.from(jsonString(doc), 'utf8'));
  });
  Given('a read_file fixture {string} of {int} zero bytes', function(name, n) {
    fixture(this, name, Buffer.alloc(n));
  });
  Given('a read_file fixture {string} of {int} lines {string} followed by the hex bytes {string}', function(name, n, line, bytes) {
    fixture(this, name, Buffer.concat([Buffer.from((line + '\n').repeat(n), 'utf8'), hex(bytes)]));
  });
  Given('a read_file fixture {string} that is a 1x1 RGB8 PNG', function(name) {
    fixture(this, name, png());
  });
  When('the model calls {string} with the arguments {string}', {timeout: 180000}, function(tool, args) {
    this.rfbnResult = call(root(this), tool, args);
  });
  Then('the tool result is a non-error text result', function() {
    check.nonErrorText(result(this));
  });
  Then('the tool result text is exactly {string}', function(want) {
    check.exactly(result(this), want);
  });
  Then('the tool result text is exactly the JSON string:', function(doc) {
    check.exactly(result(this), jsonString(doc));
  });
  Then('the tool result text contains no NUL byte and no replacement character', function() {
    check.noNulNoReplacement(result(this));
  });
  Then('the tool result text is at most {int} bytes', function(n) {
    check.atMost(result(this), n);
  });
  Then('the tool result text starts with {int} lines numbered from 1 of {string}', function(n, line) {
    check.startsWithLines(result(this), n, line);
  });
  Then('the tool result text contains {string}', function(part) {
    check.contains(result(this), part);
  });
  Then('the tool result text ends with line {int} of {string}', function(n, line) {
    check.endsWithLine(result(this), n, line);
  });
  Then('the tool result is typed parts {string}', function(types) {
    check.typedParts(result(this), types);
  });
}
