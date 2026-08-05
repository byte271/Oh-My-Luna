import { test } from 'node:test';
import assert from 'node:assert/strict';
import { match } from '../src/index.ts';

/** Assert both the positive and negative direction of a table of cases. */
function expectMatches(pattern: string, yes: readonly string[], no: readonly string[]): void {
  for (const path of yes) {
    assert.equal(match(pattern, path), true, `expected ${pattern} to match ${JSON.stringify(path)}`);
  }
  for (const path of no) {
    assert.equal(
      match(pattern, path),
      false,
      `expected ${pattern} not to match ${JSON.stringify(path)}`,
    );
  }
}

test('literal patterns match exactly and are anchored', () => {
  expectMatches(
    'src/index.ts',
    ['src/index.ts'],
    ['src/index.tsx', 'asrc/index.ts', 'src/index.t', 'src/Index.ts', 'a/src/index.ts', ''],
  );
  expectMatches('a', ['a'], ['b', 'ab', 'a/b', 'ba']);
});

test('a pattern must consume the entire path', () => {
  assert.equal(match('src', 'src/index.ts'), false);
  assert.equal(match('src/index.ts', 'src'), false);
  assert.equal(match('*', 'a/b'), false);
});

test('? matches exactly one character at the start, middle and end', () => {
  expectMatches('?bc', ['abc', 'zbc', '.bc'], ['bc', 'aabc', 'abcd']);
  expectMatches('a?c', ['abc', 'a-c'], ['ac', 'abbc']);
  expectMatches('ab?', ['abc', 'ab.'], ['ab', 'abcd']);
  expectMatches('???', ['abc'], ['ab', 'abcd']);
});

test('? does not match /', () => {
  assert.equal(match('a?b', 'a/b'), false);
  assert.equal(match('?', '/'), false);
});

test('* matches zero characters', () => {
  expectMatches('a*', ['a', 'ab', 'abc'], ['b', 'a/b']);
  expectMatches('*a', ['a', 'ba', 'bba'], ['ab']);
  expectMatches('a*b', ['ab', 'axb', 'axxb'], ['a', 'b', 'axbx']);
  expectMatches('*', ['', 'a', 'abc'], ['a/b', '/']);
});

test('* does not cross /', () => {
  assert.equal(match('*', 'a/b'), false);
  assert.equal(match('a*c', 'a/c'), false);
  assert.equal(match('*/*', 'a/b'), true);
  assert.equal(match('*/*', 'a/b/c'), false);
  assert.equal(match('src/*.ts', 'src/index.ts'), true);
  assert.equal(match('src/*.ts', 'src/deep/index.ts'), false);
});

test('* matches an empty path segment', () => {
  assert.equal(match('a/*', 'a/'), true);
  assert.equal(match('a/*/b', 'a//b'), true);
});

test('** matches zero segments', () => {
  assert.equal(match('a/**/b', 'a/b'), true);
  assert.equal(match('**/b', 'b'), true);
  assert.equal(match('**', ''), true);
});

test('** matches one segment', () => {
  assert.equal(match('a/**/b', 'a/x/b'), true);
  assert.equal(match('**/b', 'x/b'), true);
});

test('** matches many segments', () => {
  assert.equal(match('a/**/b', 'a/x/y/z/b'), true);
  assert.equal(match('**/b', 'w/x/y/z/b'), true);
  assert.equal(match('**', 'a/b/c/d'), true);
  assert.equal(match('a/**/b', 'a/x/y/c'), false);
});

test('a trailing /** matches zero or more segments, including none', () => {
  assert.equal(match('a/**', 'a'), true);
  assert.equal(match('a/**', 'a/'), true);
  assert.equal(match('a/**', 'a/b'), true);
  assert.equal(match('a/**', 'a/b/c'), true);
  assert.equal(match('a/**', 'ab'), false);
  assert.equal(match('a/**', 'b'), false);
  assert.equal(match('a/**', ''), false);
});

test('** is a globstar only when it is a whole segment', () => {
  // `a/**.ts` is a star run inside one segment, so it cannot cross `/`.
  assert.equal(match('a/**.ts', 'a/x.ts'), true);
  assert.equal(match('a/**.ts', 'a/.ts'), true);
  assert.equal(match('a/**.ts', 'a/b/x.ts'), false);
  assert.equal(match('**a/b', 'xa/b'), true);
  assert.equal(match('**a/b', 'x/a/b'), false);
});

test('consecutive globstars collapse without changing meaning', () => {
  assert.equal(match('a/**/**/b', 'a/b'), true);
  assert.equal(match('a/**/**/b', 'a/x/y/b'), true);
  assert.equal(match('**/**', 'a/b/c'), true);
});

test('character classes match one character from the set', () => {
  expectMatches('[abc]', ['a', 'b', 'c'], ['d', '', 'ab']);
  expectMatches('a[xy]z', ['axz', 'ayz'], ['az', 'abz', 'axyz']);
});

test('character class ranges', () => {
  expectMatches('[a-z]', ['a', 'm', 'z'], ['A', '0', '-']);
  expectMatches('[0-9][0-9]', ['00', '42', '99'], ['4', '4a', '123']);
  expectMatches('[a-cx-z]', ['a', 'b', 'c', 'x', 'y', 'z'], ['d', 'w']);
});

test('negated character classes with ! and ^', () => {
  expectMatches('[!abc]', ['d', 'z', '0'], ['a', 'b', 'c', '']);
  expectMatches('[^abc]', ['d', 'z', '0'], ['a', 'b', 'c']);
  expectMatches('[!a-z]', ['A', '0'], ['a', 'q', 'z']);
});

test('a negated class still cannot match /', () => {
  // The path is split on `/` before classes are consulted, so `/` is never
  // offered to a class, negated or not.
  assert.equal(match('a[!x]b', 'a/b'), false);
  assert.equal(match('[!x]', '/'), false);
});

test('- is literal at the edges of a class', () => {
  expectMatches('[-a]', ['-', 'a'], ['b']);
  expectMatches('[a-]', ['-', 'a'], ['b']);
});

test('] in the first position of a class is literal', () => {
  expectMatches('[]a]', [']', 'a'], ['b', '']);
  expectMatches('[!]a]', ['b'], [']', 'a']);
});

test('escaped metacharacters match literally', () => {
  expectMatches('a\\*b', ['a*b'], ['ab', 'axb', 'a\\*b']);
  expectMatches('a\\?b', ['a?b'], ['axb', 'ab']);
  expectMatches('\\[abc\\]', ['[abc]'], ['a', 'b', 'c']);
  expectMatches('a\\\\b', ['a\\b'], ['ab', 'a\\\\b']);
  expectMatches('\\!a', ['!a'], ['a']);
  assert.equal(match('a\\**', 'a*bc'), true);
  assert.equal(match('a\\**', 'abc'), false);
});

test('escapes inside a character class', () => {
  expectMatches('[\\]]', [']'], ['[', 'a']);
  expectMatches('[a\\-c]', ['a', '-', 'c'], ['b']);
  expectMatches('[\\\\]', ['\\'], ['a']);
});

test('an unterminated [ is a literal [', () => {
  expectMatches('[abc', ['[abc'], ['a', 'b', 'c', '[']);
  expectMatches('a[', ['a['], ['a']);
  expectMatches('[', ['['], ['', 'a']);
  expectMatches('[]', ['[]'], ['[', ']']);
  // Unterminated, so the would-be reversed range never becomes an error.
  expectMatches('[z-a', ['[z-a'], ['a', 'z']);
});

test('empty pattern and empty path', () => {
  assert.equal(match('', ''), true);
  assert.equal(match('', 'a'), false);
  assert.equal(match('a', ''), false);
  assert.equal(match('*', ''), true);
  assert.equal(match('?', ''), false);
  assert.equal(match('/', '/'), true);
  assert.equal(match('', '/'), false);
});

test('paths are not normalized or resolved', () => {
  assert.equal(match('a/./b', 'a/./b'), true);
  assert.equal(match('a/b', 'a/./b'), false);
  assert.equal(match('a/../b', 'a/../b'), true);
  assert.equal(match('b', 'a/../b'), false);
  assert.equal(match('a//b', 'a//b'), true);
  assert.equal(match('a/b', 'a//b'), false);
  assert.equal(match('/a', '/a'), true);
  assert.equal(match('a', '/a'), false);
});

test('? counts characters, not UTF-16 code units', () => {
  assert.equal(match('?', '\u{1f600}'), true);
  assert.equal(match('??', '\u{1f600}'), false);
  assert.equal(match('a?c', 'a\u{1f600}c'), true);
});

test('realistic patterns', () => {
  assert.equal(match('src/**/*.ts', 'src/a/b/c.ts'), true);
  assert.equal(match('src/**/*.ts', 'src/c.ts'), true);
  assert.equal(match('src/**/*.ts', 'src/c.js'), false);
  assert.equal(match('src/**/*.ts', 'lib/c.ts'), false);
  assert.equal(match('**/node_modules/**', 'a/b/node_modules/c/d'), true);
  assert.equal(match('**/node_modules/**', 'node_modules'), true);
  assert.equal(match('**/*.[ch]', 'src/vendor/zlib.c'), true);
  assert.equal(match('**/*.[ch]', 'src/vendor/zlib.o'), false);
});
