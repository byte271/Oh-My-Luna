/**
 * Public pattern-set API.
 *
 * A set is an ordered list where a leading `!` marks a negation. Order is
 * significant and later entries override earlier ones:
 *
 *   - a path claimed by a positive entry is included;
 *   - a later matching negation excludes it again;
 *   - a positive entry after that negation re-includes it.
 *
 * `matchAny` therefore reports the first positive entry that matches and is
 * not overridden by any later matching negation, or `-1`.
 */
import { GlobError } from './errors.ts';
import { compile } from './glob.ts';
import type { CompiledPattern } from './glob.ts';

/** One entry of a compiled set. */
export interface CompiledSetEntry {
  /** The entry as written, including any leading `!`. */
  readonly source: string;
  readonly negated: boolean;
}

/** A pattern list parsed once and reusable for many paths. */
export interface CompiledSet {
  readonly entries: readonly CompiledSetEntry[];
  /** Index of the winning positive pattern, or -1. Never throws. */
  matchAny(path: string): number;
  /** Convenience for `matchAny(path) !== -1`. */
  matches(path: string): boolean;
}

interface Entry {
  readonly matcher: CompiledPattern;
  readonly negated: boolean;
}

const CH_BANG = '!';

function compileEntry(pattern: string): Entry {
  // Only an unescaped leading `!` negates; `\!` is a literal `!`.
  const negated = pattern.startsWith(CH_BANG);
  const body = negated ? pattern.slice(1) : pattern;
  try {
    return { matcher: compile(body), negated };
  } catch (error: unknown) {
    if (negated && error instanceof GlobError) {
      // Report the offset in the entry as the caller wrote it.
      throw new GlobError(
        'malformed negated pattern',
        pattern,
        error.index + CH_BANG.length,
      );
    }
    throw error;
  }
}

/**
 * Compile a pattern list into a reusable set matcher.
 *
 * @throws {GlobError} if any pattern is malformed. The whole set is rejected.
 */
export function compileSet(patterns: readonly string[]): CompiledSet {
  const compiled: Entry[] = [];
  const entries: CompiledSetEntry[] = [];

  for (const pattern of patterns) {
    const entry = compileEntry(pattern);
    compiled.push(entry);
    entries.push({ source: pattern, negated: entry.negated });
  }

  const matchAny = (path: string): number => {
    let winner = -1;
    // A single ordered pass. Every entry is tested, because a negation late in
    // the list can still cancel a match found early in it.
    for (let i = 0; i < compiled.length; i += 1) {
      const entry = compiled[i] as Entry;
      if (!entry.matcher.match(path)) {
        continue;
      }
      if (entry.negated) {
        winner = -1;
      } else if (winner === -1) {
        winner = i;
      }
    }
    return winner;
  };

  return Object.freeze({
    entries: Object.freeze(entries),
    matchAny,
    matches: (path: string): boolean => matchAny(path) !== -1,
  });
}

/**
 * Index of the first matching pattern that survives later negations, or -1.
 *
 * Compiles on every call; use `compileSet` to match many paths.
 *
 * @throws {GlobError} if any pattern is malformed.
 */
export function matchAny(patterns: readonly string[], path: string): number {
  return compileSet(patterns).matchAny(path);
}
