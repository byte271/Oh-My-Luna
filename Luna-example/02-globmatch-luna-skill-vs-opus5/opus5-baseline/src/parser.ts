/**
 * Pattern parser.
 *
 * The parser turns a glob pattern into a list of segments. Splitting on `/`
 * happens here, once, so the matcher never has to think about separators:
 * `?`, `*` and `[...]` operate strictly inside one segment, and `**` is the
 * only construct that spans segments.
 *
 * No regular expressions are used anywhere. The pattern is scanned as an
 * array of Unicode code points with an explicit cursor.
 */
import { GlobError } from './errors.ts';

export const CP_SLASH = 0x2f;
const CP_BACKSLASH = 0x5c;
const CP_STAR = 0x2a;
const CP_QUESTION = 0x3f;
const CP_LBRACKET = 0x5b;
const CP_RBRACKET = 0x5d;
const CP_BANG = 0x21;
const CP_CARET = 0x5e;
const CP_DASH = 0x2d;

/** An inclusive code point range inside a character class. */
export interface CharRange {
  readonly lo: number;
  readonly hi: number;
}

/** A single-segment matching instruction. */
export type Token =
  | { readonly kind: 'literal'; readonly code: number }
  | { readonly kind: 'anyChar' }
  | { readonly kind: 'anyRun' }
  | { readonly kind: 'class'; readonly negated: boolean; readonly ranges: readonly CharRange[] };

/** A pattern segment made of tokens; matches exactly one path segment. */
export interface TokenSegment {
  readonly kind: 'tokens';
  readonly tokens: readonly Token[];
  /** Minimum number of code points this segment can consume. */
  readonly minLength: number;
  /** True when the segment has no `*`, so the consumed length is fixed. */
  readonly exact: boolean;
  /** Code points when every token is a literal, enabling a fast path. */
  readonly literal: readonly number[] | null;
}

/** A `**` segment; matches zero or more whole path segments. */
export interface GlobstarSegment {
  readonly kind: 'globstar';
}

export type Segment = TokenSegment | GlobstarSegment;

/** A parsed pattern plus the cheap rejection facts derived from it. */
export interface ParsedPattern {
  readonly segments: readonly Segment[];
  /** Number of path segments the pattern must consume at minimum. */
  readonly minSegments: number;
  readonly hasGlobstar: boolean;
}

const ANY_CHAR: Token = { kind: 'anyChar' };
const ANY_RUN: Token = { kind: 'anyRun' };
const GLOBSTAR: GlobstarSegment = { kind: 'globstar' };

/**
 * Split a string into Unicode code points, so `?` matches one *character*
 * rather than one UTF-16 code unit (an emoji is one `?`, not two).
 */
export function toCodePoints(value: string): number[] {
  const out: number[] = [];
  for (const char of value) {
    out.push(char.codePointAt(0) as number);
  }
  return out;
}

interface ParsedClass {
  readonly token: Token;
  readonly next: number;
}

/**
 * Parse a `[...]` character class starting at `start`.
 *
 * Returns `null` when the class is unterminated, in which case the caller
 * treats the `[` as a literal character. A reversed range such as `[z-a]` is
 * only reported once the class is known to be well formed, so an unterminated
 * `[z-a` stays a harmless literal rather than becoming an error.
 */
function parseCharClass(cp: readonly number[], start: number, pattern: string): ParsedClass | null {
  let i = start + 1;
  let negated = false;

  if (i < cp.length && (cp[i] === CP_BANG || cp[i] === CP_CARET)) {
    negated = true;
    i += 1;
  }

  const ranges: CharRange[] = [];
  let reversedAt = -1;
  // A `]` in the first position is a literal `]`, matching POSIX convention.
  let first = true;

  while (i < cp.length) {
    if (cp[i] === CP_RBRACKET && !first) {
      if (reversedAt >= 0) {
        throw new GlobError('character class range is reversed', pattern, reversedAt);
      }
      return { token: { kind: 'class', negated, ranges }, next: i + 1 };
    }
    first = false;

    const itemStart = i;
    let lo: number;
    if (cp[i] === CP_BACKSLASH) {
      if (i + 1 >= cp.length) {
        return null; // Dangling escape means the class never closes.
      }
      lo = cp[i + 1] as number;
      i += 2;
    } else {
      lo = cp[i] as number;
      i += 1;
    }

    // `-` is only a range operator between two items; leading or trailing it
    // is an ordinary character.
    if (i + 1 < cp.length && cp[i] === CP_DASH && cp[i + 1] !== CP_RBRACKET) {
      i += 1;
      let hi: number;
      if (cp[i] === CP_BACKSLASH) {
        if (i + 1 >= cp.length) {
          return null;
        }
        hi = cp[i + 1] as number;
        i += 2;
      } else {
        hi = cp[i] as number;
        i += 1;
      }
      if (hi < lo && reversedAt < 0) {
        reversedAt = itemStart;
      }
      ranges.push({ lo, hi });
    } else {
      ranges.push({ lo, hi: lo });
    }
  }

  return null; // No closing `]`.
}

function makeTokenSegment(tokens: readonly Token[]): TokenSegment {
  let minLength = 0;
  let exact = true;
  let allLiteral = true;
  const codes: number[] = [];

  for (const token of tokens) {
    switch (token.kind) {
      case 'anyRun':
        exact = false;
        allLiteral = false;
        break;
      case 'literal':
        minLength += 1;
        codes.push(token.code);
        break;
      default:
        minLength += 1;
        allLiteral = false;
        break;
    }
  }

  return {
    kind: 'tokens',
    tokens,
    minLength,
    exact,
    literal: allLiteral ? codes : null,
  };
}

/**
 * Parse a pattern into segments.
 *
 * @throws {GlobError} when the pattern ends with a dangling `\`, or contains a
 * reversed character class range.
 */
export function parsePattern(pattern: string): ParsedPattern {
  const cp = toCodePoints(pattern);
  const segments: Segment[] = [];
  let tokens: Token[] = [];
  let isGlobstar = false;
  let i = 0;

  const flush = (): void => {
    if (isGlobstar) {
      // Adjacent `**` segments are redundant: each already matches zero or
      // more segments, so collapsing them keeps the match DP smaller.
      const last = segments[segments.length - 1];
      if (last === undefined || last.kind !== 'globstar') {
        segments.push(GLOBSTAR);
      }
      isGlobstar = false;
    } else {
      segments.push(makeTokenSegment(tokens));
    }
    tokens = [];
  };

  while (i < cp.length) {
    const c = cp[i] as number;

    if (c === CP_SLASH) {
      flush();
      i += 1;
      continue;
    }

    if (c === CP_BACKSLASH) {
      if (i + 1 >= cp.length) {
        throw new GlobError('unterminated trailing backslash', pattern, i);
      }
      tokens.push({ kind: 'literal', code: cp[i + 1] as number });
      i += 2;
      continue;
    }

    if (c === CP_QUESTION) {
      tokens.push(ANY_CHAR);
      i += 1;
      continue;
    }

    if (c === CP_STAR) {
      let j = i;
      while (j < cp.length && cp[j] === CP_STAR) {
        j += 1;
      }
      // `**` is a globstar only when it is the entire segment. Anywhere else
      // (`a/**.ts`) a run of stars is just a `*`, confined to one segment.
      const wholeSegment = tokens.length === 0 && (j === cp.length || cp[j] === CP_SLASH);
      if (j - i >= 2 && wholeSegment) {
        isGlobstar = true;
      } else {
        // Collapsing a run of stars to a single token is what keeps
        // adversarial patterns like `****...*` cheap.
        tokens.push(ANY_RUN);
      }
      i = j;
      continue;
    }

    if (c === CP_LBRACKET) {
      const parsed = parseCharClass(cp, i, pattern);
      if (parsed !== null) {
        tokens.push(parsed.token);
        i = parsed.next;
        continue;
      }
      // An unterminated `[` is an ordinary character.
      tokens.push({ kind: 'literal', code: CP_LBRACKET });
      i += 1;
      continue;
    }

    tokens.push({ kind: 'literal', code: c });
    i += 1;
  }

  flush();

  let minSegments = 0;
  let hasGlobstar = false;
  for (const segment of segments) {
    if (segment.kind === 'globstar') {
      hasGlobstar = true;
    } else {
      minSegments += 1;
    }
  }

  return { segments, minSegments, hasGlobstar };
}
