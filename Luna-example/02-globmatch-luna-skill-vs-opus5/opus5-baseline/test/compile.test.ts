import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, match } from '../src/index.ts';

const PATTERNS = [
  '',
  'a',
  '*',
  '?',
  'a/b',
  '*.ts',
  'src/*.ts',
  'src/**/*.ts',
  'a/**',
  '**/b',
  'a/**/b',
  'a/**.ts',
  '[abc]',
  '[a-z]*',
  '[!a-z]?',
  '[]a]',
  '[abc',
  'a\\*b',
  '\\[x\\]',
  '**/node_modules/**',
  'a**b/c',
];

const PATHS = [
  '',
  '/',
  'a',
  'b',
  'a/b',
  'a/b/c',
  'a/',
  '/a',
  'a//b',
  'src/index.ts',
  'src/a/b/index.ts',
  'src/index.js',
  '[abc',
  ']',
  'a*b',
  '[x]',
  'node_modules',
  'a/node_modules/b',
  'aXXb/c',
  '\u{1f600}',
];

test('compile-once-match-many agrees with direct matching', () => {
  for (const pattern of PATTERNS) {
    const matcher = compile(pattern);
    for (const path of PATHS) {
      assert.equal(
        matcher.match(path),
        match(pattern, path),
        `compile(${JSON.stringify(pattern)}).match(${JSON.stringify(path)}) disagreed with match()`,
      );
    }
  }
});

test('a compiled matcher is stable across repeated use', () => {
  const matcher = compile('src/**/*.ts');
  const expected = [true, true, false, false];
  const paths = ['src/a.ts', 'src/a/b/c.ts', 'src/a.js', 'lib/a.ts'];

  // Re-running the same matcher must not accumulate state between calls.
  for (let round = 0; round < 5; round += 1) {
    for (let i = 0; i < paths.length; i += 1) {
      assert.equal(matcher.match(paths[i] as string), expected[i]);
    }
  }
});

test('a compiled matcher exposes its source and is frozen', () => {
  const matcher = compile('a/**/b');
  assert.equal(matcher.source, 'a/**/b');
  assert.equal(Object.isFrozen(matcher), true);
});

test('interleaving two compiled matchers does not corrupt either', () => {
  const ts = compile('**/*.ts');
  const js = compile('**/*.js');
  for (let i = 0; i < 100; i += 1) {
    assert.equal(ts.match('a/b/c.ts'), true);
    assert.equal(js.match('a/b/c.ts'), false);
    assert.equal(ts.match('a/b/c.js'), false);
    assert.equal(js.match('a/b/c.js'), true);
  }
});
