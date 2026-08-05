/**
 * Public single-pattern API.
 */
import { parsePattern } from './parser.ts';
import { matchParsed } from './matcher.ts';

/** A pattern that has been parsed once and can be reused for many paths. */
export interface CompiledPattern {
  /** The original pattern text. */
  readonly source: string;
  /** Test a path. Never throws: all validation happened at compile time. */
  match(path: string): boolean;
}

/**
 * Compile a pattern into a reusable matcher.
 *
 * All per-pattern work — scanning, splitting into segments, building character
 * classes — happens here, so matching many paths repeats none of it.
 *
 * @throws {GlobError} if the pattern is malformed.
 */
export function compile(pattern: string): CompiledPattern {
  const parsed = parsePattern(pattern);
  return Object.freeze({
    source: pattern,
    match: (path: string): boolean => matchParsed(parsed, path),
  });
}

/**
 * Test a single path against a single pattern.
 *
 * This compiles on every call. There is deliberately no global pattern cache:
 * patterns are untrusted input, and an unbounded cache keyed by them would be
 * a memory-growth vector. Callers matching many paths should use `compile`.
 *
 * @throws {GlobError} if the pattern is malformed.
 */
export function match(pattern: string, path: string): boolean {
  return matchParsed(parsePattern(pattern), path);
}
