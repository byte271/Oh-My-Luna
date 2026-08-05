/**
 * Adversarial inputs.
 *
 * Each case is shaped to blow up a backtracking matcher (or a glob-to-regex
 * translation) while being trivial for the dynamic programming used here. The
 * assertions check the answer *and* a wall-clock ceiling; the ceiling is set
 * generously, because the failure mode being guarded against is not "slow" but
 * "does not finish".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, match, matchAny } from '../src/index.ts';

/** Run `fn`, assert it returned `expected`, and report the elapsed time. */
function timed(label: string, budgetMs: number, expected: boolean, fn: () => boolean): void {
  const started = Date.now();
  const actual = fn();
  const elapsed = Date.now() - started;
  assert.equal(actual, expected, `${label}: wrong result`);
  assert.ok(elapsed < budgetMs, `${label}: took ${elapsed}ms, budget was ${budgetMs}ms`);
}

test('many consecutive * against a long non-matching segment', () => {
  const pattern = '*'.repeat(200) + 'x';
  const path = 'a'.repeat(20000);
  timed('star run', 2000, false, () => match(pattern, path));
});

test('alternating *a against a long non-matching segment', () => {
  // The classic catastrophic-backtracking shape: /^(.*a)+b$/ style work.
  const pattern = '*a'.repeat(100) + 'b';
  const path = 'a'.repeat(5000);
  timed('star-literal alternation', 2000, false, () => match(pattern, path));
});

test('many ? and * mixed against a long non-matching segment', () => {
  const pattern = '?*'.repeat(150) + 'z';
  const path = 'y'.repeat(10000);
  timed('question-star alternation', 2000, false, () => match(pattern, path));
});

test('many consecutive ** segments against a long non-matching path', () => {
  const pattern = '**/'.repeat(200) + 'needle';
  const path = 'a/'.repeat(2000) + 'haystack';
  timed('globstar run', 2000, false, () => match(pattern, path));
});

test('interleaved ** and wildcard segments against a long non-matching path', () => {
  // Adjacent globstars collapse, so this interleaves them with real segments
  // to keep the segment-level DP genuinely wide.
  const pattern = '**/*a'.repeat(60) + '/needle';
  const path = 'a/'.repeat(1500) + 'haystack';
  timed('interleaved globstar', 3000, false, () => match(pattern, path));
});

test('globstars against a long path of empty segments', () => {
  const pattern = '**/x'.repeat(50);
  const path = '/'.repeat(3000);
  timed('empty segments', 3000, false, () => match(pattern, path));
});

test('a wide character class repeated against a long non-matching segment', () => {
  const pattern = '[a-y]*'.repeat(100) + 'z';
  const path = 'q'.repeat(5000);
  timed('class alternation', 2000, false, () => match(pattern, path));
});

test('a compiled adversarial pattern stays fast across many paths', () => {
  const matcher = compile('**/*a'.repeat(40) + '/needle');
  const paths: string[] = [];
  for (let i = 0; i < 200; i += 1) {
    paths.push('a/'.repeat(100) + `haystack${i}`);
  }

  const started = Date.now();
  let matched = 0;
  for (const path of paths) {
    if (matcher.match(path)) {
      matched += 1;
    }
  }
  const elapsed = Date.now() - started;

  assert.equal(matched, 0);
  assert.ok(elapsed < 5000, `compiled adversarial matching took ${elapsed}ms`);
});

test('an adversarial pattern set is bounded by its size', () => {
  const patterns: string[] = [];
  for (let i = 0; i < 100; i += 1) {
    patterns.push('**/*a'.repeat(10) + `/needle${i}`);
    patterns.push(`!**/*b${i}`);
  }
  const path = 'a/'.repeat(300) + 'haystack';
  timed('adversarial set', 5000, true, () => matchAny(patterns, path) === -1);
});

test('near-miss inputs still produce correct answers', () => {
  // Same shapes as above, but arranged to actually match, so the fast
  // rejections cannot be hiding a wrong answer.
  assert.equal(match('*'.repeat(200) + 'x', 'a'.repeat(2000) + 'x'), true);
  assert.equal(match('*a'.repeat(10) + 'b', 'a'.repeat(500) + 'b'), true);
  assert.equal(match('**/'.repeat(50) + 'needle', 'a/'.repeat(500) + 'needle'), true);
  assert.equal(match('[a-y]*'.repeat(10) + 'z', 'q'.repeat(500) + 'z'), true);
});
