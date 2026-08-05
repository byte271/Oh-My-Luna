/**
 * Differential test against a brute-force oracle.
 *
 * The library matches with dynamic programming, which is fast but not
 * obviously correct. This file re-implements the wildcard semantics the other
 * way round — naive exponential recursion, no memoisation, no shared code —
 * and checks that the two agree on *every* pattern of up to four characters
 * over `a b / ? *` against *every* path of up to four characters over `a b /`.
 *
 * The alphabet deliberately excludes character classes and escapes so that the
 * oracle stays short enough to be trusted by reading it. Those constructs are
 * covered by the explicit tables in `match.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { match } from '../src/index.ts';

/** A whole segment of two or more stars is a globstar. */
function isGlobstar(segment: string): boolean {
  if (segment.length < 2) {
    return false;
  }
  for (const char of segment) {
    if (char !== '*') {
      return false;
    }
  }
  return true;
}

/** Naive within-segment matching: try every split point for `*`. */
function oracleSegment(pattern: string, text: string): boolean {
  if (pattern.length === 0) {
    return text.length === 0;
  }
  const head = pattern.slice(0, 1);
  const rest = pattern.slice(1);
  if (head === '*') {
    for (let k = 0; k <= text.length; k += 1) {
      if (oracleSegment(rest, text.slice(k))) {
        return true;
      }
    }
    return false;
  }
  if (text.length === 0) {
    return false;
  }
  if (head === '?') {
    return oracleSegment(rest, text.slice(1));
  }
  return head === text.slice(0, 1) && oracleSegment(rest, text.slice(1));
}

/** Naive segment-level matching: try every span for `**`. */
function oracleMatch(pattern: string, path: string): boolean {
  const patternSegments = pattern.split('/');
  const pathSegments = path.split('/');

  const go = (i: number, j: number): boolean => {
    if (i === patternSegments.length) {
      return j === pathSegments.length;
    }
    const segment = patternSegments[i] as string;
    if (isGlobstar(segment)) {
      for (let k = j; k <= pathSegments.length; k += 1) {
        if (go(i + 1, k)) {
          return true;
        }
      }
      return false;
    }
    return (
      j < pathSegments.length && oracleSegment(segment, pathSegments[j] as string) && go(i + 1, j + 1)
    );
  };

  return go(0, 0);
}

/** Every string over `alphabet` with length 0..maxLength. */
function enumerate(alphabet: readonly string[], maxLength: number): string[] {
  let level: string[] = [''];
  const all: string[] = [''];
  for (let n = 1; n <= maxLength; n += 1) {
    const next: string[] = [];
    for (const base of level) {
      for (const char of alphabet) {
        const built = base + char;
        next.push(built);
        all.push(built);
      }
    }
    level = next;
  }
  return all;
}

test('the matcher agrees with a brute-force oracle on every small input', () => {
  const patterns = enumerate(['a', 'b', '/', '?', '*'], 4);
  const paths = enumerate(['a', 'b', '/'], 4);

  assert.equal(patterns.length, 781);
  assert.equal(paths.length, 121);

  let pairs = 0;
  for (const pattern of patterns) {
    for (const path of paths) {
      const actual = match(pattern, path);
      const expected = oracleMatch(pattern, path);
      if (actual !== expected) {
        assert.fail(
          `match(${JSON.stringify(pattern)}, ${JSON.stringify(path)}) returned ${actual}, ` +
            `oracle says ${expected}`,
        );
      }
      pairs += 1;
    }
  }

  assert.equal(pairs, 94501);
});
