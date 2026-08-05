import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GlobError, compile, compileSet, match, matchAny } from '../src/index.ts';

test('an unterminated trailing backslash is rejected', () => {
  assert.throws(() => match('abc\\', 'abc'), GlobError);
  assert.throws(() => match('\\', ''), GlobError);
  assert.throws(() => match('a/b\\', 'a/b'), GlobError);
  assert.throws(() => compile('abc\\'), GlobError);
});

test('an escaped backslash at the end is fine', () => {
  assert.equal(match('abc\\\\', 'abc\\'), true);
});

test('a trailing backslash inside an unterminated class is still rejected', () => {
  // The `[` degrades to a literal, then the dangling escape is the error.
  assert.throws(() => compile('[abc\\'), GlobError);
});

test('a reversed character class range is rejected', () => {
  assert.throws(() => compile('[z-a]'), GlobError);
  assert.throws(() => compile('[9-0]'), GlobError);
  assert.doesNotThrow(() => compile('[a-a]'));
});

test('GlobError carries the pattern and the offset', () => {
  try {
    compile('ab\\');
    assert.fail('expected a GlobError');
  } catch (error: unknown) {
    assert.ok(error instanceof GlobError);
    assert.equal(error.name, 'GlobError');
    assert.equal(error.pattern, 'ab\\');
    assert.equal(error.index, 2);
    assert.ok(error instanceof Error);
  }
});

test('malformed patterns fail at compile time, not at match time', () => {
  // Compiling must throw...
  assert.throws(() => compile('bad\\'), GlobError);

  // ...and anything that did compile must never throw while matching.
  const matcher = compile('src/**/*.ts');
  for (const path of ['', '/', 'src', 'src/a.ts', 'a\\b', '\u{1f600}', 'a'.repeat(1000)]) {
    assert.doesNotThrow(() => matcher.match(path));
  }
});

test('a malformed pattern anywhere in a set rejects the whole set', () => {
  assert.throws(() => compileSet(['ok', 'bad\\']), GlobError);
  assert.throws(() => matchAny(['ok', 'bad\\'], 'ok'), GlobError);
  assert.throws(() => compileSet(['!bad\\']), GlobError);
});

test('a set reports the offset in the entry as written', () => {
  try {
    compileSet(['!ab\\']);
    assert.fail('expected a GlobError');
  } catch (error: unknown) {
    assert.ok(error instanceof GlobError);
    assert.equal(error.pattern, '!ab\\');
    // Offset 3 in "!ab\", i.e. shifted past the leading "!".
    assert.equal(error.index, 3);
  }
});
