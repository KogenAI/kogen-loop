'use strict';
// Acceptance steps for the line-aware cut marker (Intent l-cut-marker-lines). The Go driver
// l_cut_marker_lines_driver.go reports what tools.Cut, the engine's read_file delivery and the
// shell envelope produce; this file owns the expectations. Run directly with "good" or "bad"
// it checks its own observer against a known-good and known-bad cut.
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');

const BOUND = 16384, HEAD = 4096;
const MARKER = /\n\[\.\.\. (?:(\d+) (lines?)(?: \((\d+)-(\d+)\))?, )?(\d+) bytes omitted \.\.\.\]\n/;
const bytes = (s) => Buffer.byteLength(s);

function exact(unit, size) {
  return unit.repeat(Math.ceil(size / unit.length)).slice(0, size);
}

// numberedText is read_file-shaped text of exactly size bytes: "N\t" lines joined by "\n".
function numberedText(size) {
  const lines = [];
  let len = -1;
  for (let i = 1; ; i++) {
    const line = `${i}\t${'x'.repeat(40)}`;
    if (len + 1 + line.length > size) {
      const room = size - len - 1, prefix = `${i}\t`;
      if (room >= prefix.length) lines.push(prefix + 'x'.repeat(room - prefix.length));
      else lines[lines.length - 1] += 'x'.repeat(room + 1);
      break;
    }
    lines.push(line);
    len += 1 + line.length;
  }
  return lines.join('\n');
}

function fixture(shape, size) {
  if (shape === 'plain lines') return exact('x'.repeat(79) + '\n', size);
  if (shape === 'numbered lines') return numberedText(size);
  if (shape === 'single line') return 'x'.repeat(size);
  if (shape === 'status line and one long line') return 'exit status: 0\n' + 'a'.repeat(size - 15);
  if (shape === 'escaping lines') return exact('say "hi" <b>\tok\n', size);
  throw new Error('unknown fixture shape ' + shape);
}

// splitLines keeps each line's "\n"; a final "\n" ends the last line.
const splitLines = (s) => (s === '' ? [] : s.split(/(?<=\n)/));
const numberOf = (line) => /^([1-9][0-9]*)\t/.exec(line)?.[1];

// parse checks the contract every cut text meets and returns its parts. The shell envelope
// cuts its output to a smaller bound so the escaped JSON fits, so fitting output may be cut.
function parse(text, cut, envelope = false) {
  assert.ok(bytes(cut) <= BOUND, `delivered ${bytes(cut)} bytes, more than ${BOUND}`);
  if (!envelope && bytes(text) <= BOUND) {
    assert.equal(cut, text, 'fitting text must be delivered unchanged');
    return null;
  }
  const m = MARKER.exec(cut);
  assert.ok(m, 'no omission marker in ' + JSON.stringify(cut.slice(0, 120)) + '...');
  const head = cut.slice(0, m.index), tail = cut.slice(m.index + m[0].length);
  assert.ok(text.startsWith(head) && text.endsWith(tail), 'the kept ends are not the ends of the text');
  assert.ok(bytes(head) <= HEAD, `head ${bytes(head)} bytes, more than ${HEAD}`);
  const omitted = text.slice(head.length, text.length - tail.length);
  assert.equal(Number(m[5]), bytes(omitted), 'the marker must count the bytes actually omitted');
  const p = {head, tail, omitted, marker: m[0].slice(1, -1), kind: m[3] ? 'range' : m[1] ? 'lines' : 'bytes'};
  if (p.kind !== 'bytes') {
    p.lines = Number(m[1]);
    assert.ok(head.endsWith('\n') && omitted.endsWith('\n'), 'a line marker needs whole lines omitted');
    assert.equal(p.lines, splitLines(omitted).length, 'the marker must count the complete lines omitted');
    assert.equal(m[2], p.lines === 1 ? 'line' : 'lines', 'line unit');
  }
  if (p.kind === 'range') {
    p.from = Number(m[3]);
    p.to = Number(m[4]);
    assert.equal(String(p.from), numberOf(omitted), 'the range must start at the first omitted line number');
    assert.equal(p.to, p.from + p.lines - 1, 'the range must end at the last omitted line number');
  }
  return p;
}

function check(text, [cut, twice], kind) {
  assert.equal(twice, cut, 'cutting a cut text must change nothing');
  const p = parse(text, cut);
  if (kind === 'unchanged') assert.equal(p, null, 'the text must be delivered unchanged');
  else assert.equal(p?.kind, kind, `marker kind for ${JSON.stringify(p?.marker)}`);
  return p;
}

function drive(mode, text) {
  const r = spawnSync('go', ['run', 'features/steps/l_cut_marker_lines_driver.go', mode], {input: JSON.stringify(text), encoding: 'utf8', timeout: 170000, maxBuffer: 1 << 26});
  assert.equal(r.status, 0, `go run features/steps/l_cut_marker_lines_driver.go ${mode} exited ${r.status}\n${r.stdout}${r.stderr}`);
  return JSON.parse(r.stdout);
}

function expected(text, head, marker, tail) {
  const lines = splitLines(text);
  return lines.slice(0, head).join('') + '\n' + marker + '\n' + (tail ? lines.slice(-tail).join('') : '');
}

// reference is the specified cut, used only to build the observer's known-good input.
function reference(text) {
  if (bytes(text) <= BOUND) return text;
  let head = text.slice(0, HEAD);
  head = head.slice(0, head.lastIndexOf('\n') + 1) || head;
  const suffix = (reserve) => {
    const t = text.slice(text.length - (BOUND - HEAD - reserve));
    const i = t.indexOf('\n');
    return i < 0 ? [t, false] : [t.slice(i + 1), true];
  };
  const all = splitLines(text);
  const numbered = all.every((l, i) => numberOf(l) === String(Number(numberOf(all[0])) + i));
  const lineMarker = (n, lines, a) => `\n[... ${lines} ${lines === 1 ? 'line' : 'lines'}${numbered ? ` (${a}-${a + lines - 1})` : ''}, ${n} bytes omitted ...]\n`;
  if (head.endsWith('\n')) {
    const last = numberOf(all.at(-1));
    const reserve = `\n[... ${text.length} lines${numbered ? ` (${last}-${last})` : ''}, ${text.length} bytes omitted ...]\n`;
    const [tail, ok] = suffix(reserve.length);
    if (ok) {
      const omitted = text.slice(head.length, text.length - tail.length);
      return head + lineMarker(omitted.length, splitLines(omitted).length, Number(numberOf(omitted))) + tail;
    }
  }
  const [tail] = suffix(`\n[... ${text.length} bytes omitted ...]\n`.length);
  return head + `\n[... ${text.length - head.length - tail.length} bytes omitted ...]\n` + tail;
}

if (require.main === module) {
  const text = fixture('numbered lines', 40000);
  const good = reference(text);
  if (process.argv[2] === 'good') {
    check(text, [good, good], 'range');
    const lines = fixture('plain lines', 40000), cut = reference(lines);
    check(lines, [cut, cut], 'lines');
    const single = fixture('single line', 99999), byteCut = reference(single);
    check(single, [byteCut, byteCut], 'bytes');
    console.log('observer good');
  } else {
    const m = MARKER.exec(good)[0];
    const bad = [
      good.replace(m, m.replace(/ \(\d+-\d+\)/, '')),
      good.replace(/\((\d+)-/, (_, a) => `(${Number(a) + 1}-`),
      good.replace(/-(\d+)\)/, (_, b) => `-${Number(b) - 1})`),
      good.replace(/\[\.\.\. (\d+) lines/, (_, l) => `[... ${Number(l) + 1} lines`),
      good.replace(/, (\d+) bytes/, (_, n) => `, ${Number(n) - 1} bytes`),
      good.replace(m, m.replace(/^\n\[\.\.\. \d+ lines \(\d+-\d+\), /, '\n[... ')),
      good + 'x'.repeat(BOUND),
    ];
    for (const cut of bad) assert.throws(() => check(text, [cut, cut], 'range'));
    assert.throws(() => check(text, [good, good + '!'], 'range'));
    console.log('observer bad rejected');
    process.exitCode = 1;
  }
} else {
  const {When, Then} = require('@cucumber/cucumber');
  When('I cut the {string} text of {int} bytes', {timeout: 180000}, function (shape, size) {
    this.cutText = fixture(shape, size);
    this.cutResult = drive('cut', this.cutText);
  });
  When('the engine delivers the read_file result of a file with {int} lines', {timeout: 180000}, function (count) {
    const lines = Array.from({length: count}, (_, i) => `row ${i + 1} ${'y'.repeat(24)}`);
    this.cutText = lines.map((l, i) => `${i + 1}\t${l}`).join('\n');
    const delivered = drive('read', lines.join('\n') + '\n');
    this.cutResult = [delivered, delivered];
  });
  When('a shell command prints the {string} text of {int} bytes and its handle retrieves it', {timeout: 180000}, function (shape, size) {
    this.cutText = fixture(shape, size);
    this.envelopes = drive('shell', this.cutText);
  });
  Then('the delivered text is the first {int} lines, the marker {string} and the last {int} lines', function (head, marker, tail) {
    assert.equal(this.cutResult[0], expected(this.cutText, head, marker, tail), 'exact delivered text');
  });
  Then('the delivered text is the first {int} bytes, the marker {string} and the last {int} bytes', function (head, marker, tail) {
    const text = this.cutText;
    assert.equal(this.cutResult[0], text.slice(0, head) + '\n' + marker + '\n' + text.slice(text.length - tail), 'exact delivered text');
  });
  Then('cutting the delivered text again changes nothing', function () {
    const [cut, twice] = this.cutResult;
    assert.ok(cut !== this.cutText, 'the text must have been cut');
    assert.equal(twice, cut, 'cutting a cut text must change nothing');
  });
  Then('the delivered text is unchanged', function () {
    check(this.cutText, this.cutResult, 'unchanged');
  });
  Then('the delivered text has a {string} marker that accounts for it exactly', function (kind) {
    this.cutParts = check(this.cutText, this.cutResult, kind);
  });
  Then('the kept and omitted lines add up to {int} lines', function (total) {
    const p = this.cutParts;
    assert.equal(splitLines(this.cutText).length, total, 'fixture line count');
    assert.equal(splitLines(p.head).length + p.lines + splitLines(p.tail).length, total, `head ${splitLines(p.head).length} + omitted ${p.lines} + tail ${splitLines(p.tail).length} lines`);
  });
  Then('the head ends at the line before the omitted range and the tail starts at the line after it', function () {
    const p = this.cutParts;
    assert.equal(numberOf(splitLines(p.head).at(-1)), String(p.from - 1), `last head line for range ${p.from}-${p.to}`);
    assert.equal(numberOf(p.tail), String(p.to + 1), `first tail line for range ${p.from}-${p.to}`);
  });
  Then('both shell envelopes are valid JSON of at most 16384 bytes', function () {
    this.envelopeValues = this.envelopes.map((e, i) => {
      assert.ok(bytes(e) <= BOUND, `envelope ${i + 1} is ${bytes(e)} bytes`);
      return JSON.parse(e);
    });
    assert.deepEqual(this.envelopeValues.map((v) => v.status), ['running', 'completed']);
    assert.equal(this.envelopeValues[1].exit_status, 0, 'completed exit status');
  });
  Then('the completed output has a {string} marker that accounts for the printed text', function (kind) {
    const output = this.envelopeValues[1].output;
    assert.equal(parse(this.cutText, output, true)?.kind, kind, 'completed envelope output marker kind');
    assert.ok(bytes(output) < bytes(this.cutText), 'the completed output must be cut');
  });
}
