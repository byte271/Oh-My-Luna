import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileSet, matchAny } from '../src/index.ts';

test('matchAny returns the index of the first matching pattern', () => {
  assert.equal(matchAny(['*.js', '*.ts', 'src/*'], 'a.ts'), 1);
  assert.equal(matchAny(['*.ts', 'a.ts'], 'a.ts'), 0);
  assert.equal(matchAny(['*.js'], 'a.ts'), -1);
  assert.equal(matchAny([], 'a.ts'), -1);
});

test('a later negation excludes a path matched earlier', () => {
  assert.equal(matchAny(['*.ts', '!*.d.ts'], 'a.ts'), 0);
  assert.equal(matchAny(['*.ts', '!*.d.ts'], 'a.d.ts'), -1);
});

test('order is significant and later patterns override earlier ones', () => {
  // Positive, negated, positive again: the last word wins, and the reported
  // index is the first surviving positive match.
  assert.equal(matchAny(['*.ts', '!*.d.ts', 'special.d.ts'], 'special.d.ts'), 2);
  assert.equal(matchAny(['*.ts', '!*.d.ts', 'special.d.ts'], 'other.d.ts'), -1);

  // A negation before the positive it would have cancelled does nothing.
  assert.equal(matchAny(['!*.d.ts', '*.ts'], 'a.d.ts'), 1);

  // Re-excluding after re-including.
  assert.equal(matchAny(['*.ts', '!*.d.ts', 'special.d.ts', '!special.d.ts'], 'special.d.ts'), -1);
});

test('a negation alone never includes anything', () => {
  assert.equal(matchAny(['!*.ts'], 'a.ts'), -1);
  assert.equal(matchAny(['!*.ts'], 'a.js'), -1);
});

test('negation composes with globstars', () => {
  const patterns = ['src/**/*.ts', '!src/**/*.test.ts'];
  assert.equal(matchAny(patterns, 'src/a/b.ts'), 0);
  assert.equal(matchAny(patterns, 'src/a/b.test.ts'), -1);
  assert.equal(matchAny(patterns, 'lib/a.ts'), -1);
});

test('a leading ! can be escaped to mean a literal !', () => {
  assert.equal(matchAny(['\\!a'], '!a'), 0);
  assert.equal(matchAny(['\\!a'], 'a'), -1);

  const set = compileSet(['\\!a']);
  assert.equal(set.entries[0]?.negated, false);
});

test('compileSet exposes the entries as written', () => {
  const set = compileSet(['*.ts', '!*.d.ts']);
  assert.equal(set.entries.length, 2);
  assert.deepEqual(
    set.entries.map((entry) => [entry.source, entry.negated]),
    [
      ['*.ts', false],
      ['!*.d.ts', true],
    ],
  );
});

test('compileSet.matches is matchAny !== -1', () => {
  const set = compileSet(['*.ts', '!*.d.ts']);
  assert.equal(set.matches('a.ts'), true);
  assert.equal(set.matches('a.d.ts'), false);
  assert.equal(set.matches('a.js'), false);
});

test('a compiled set gives the same answers as matchAny', () => {
  const patterns = ['**/*.ts', '!**/*.d.ts', 'vendor/**', '!vendor/**/*.min.js'];
  const set = compileSet(patterns);
  const paths = [
    'a.ts',
    'a.d.ts',
    'src/deep/a.ts',
    'src/deep/a.d.ts',
    'vendor/x.js',
    'vendor/lib/x.min.js',
    'vendor',
    '',
    'README.md',
  ];
  for (const path of paths) {
    assert.equal(set.matchAny(path), matchAny(patterns, path), `mismatch for ${path}`);
  }
});
