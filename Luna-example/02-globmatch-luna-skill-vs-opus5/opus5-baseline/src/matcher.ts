/**
 * Matching engine.
 *
 * Two nested dynamic programs, neither of which ever backtracks:
 *
 *  1. `matchSegment` walks the tokens of one pattern segment across one path
 *     segment, carrying the *set* of reachable text offsets forward. Cost is
 *     O(tokens x characters).
 *
 *  2. `matchParsed` walks pattern segments across path segments, carrying the
 *     set of reachable path-segment boundaries forward. `**` propagates that
 *     set to every later boundary in one linear sweep.
 *
 * Because level 2 asks level 1 about each (pattern segment, path segment) pair
 * at most once, total work is bounded by
 *
 *     sum_i |segment_i| * sum_j |pathSegment_j|  <=  |pattern| * |path|
 *
 * There is no input a caller can choose that turns this exponential; the
 * classic `*a*a*a...` blowup that defeats backtracking matchers is linear here
 * in each dimension.
 *
 * No regular expressions are used.
 */
import { CP_SLASH, toCodePoints } from './parser.ts';
import type { ParsedPattern, Segment, Token, TokenSegment } from './parser.ts';

/** Does a single-character token accept this code point? */
function charMatches(token: Token, code: number): boolean {
  switch (token.kind) {
    case 'literal':
      return token.code === code;
    case 'anyChar':
      return true;
    case 'class': {
      let inSet = false;
      for (const range of token.ranges) {
        if (code >= range.lo && code <= range.hi) {
          inSet = true;
          break;
        }
      }
      return token.negated ? !inSet : inSet;
    }
    default:
      // `anyRun` consumes a variable span and is handled by the caller.
      return false;
  }
}

/**
 * Match one pattern segment against `text[from..to)`.
 *
 * `/` can never appear in that range because the path was split on `/` first,
 * which is precisely why `?`, `*` and `[...]` cannot cross a separator: they
 * are never shown one.
 */
export function matchSegment(
  segment: TokenSegment,
  text: readonly number[],
  from: number,
  to: number,
): boolean {
  const n = to - from;

  // Cheap rejections before allocating anything.
  if (n < segment.minLength) {
    return false;
  }
  if (segment.exact && n !== segment.minLength) {
    return false;
  }

  const literal = segment.literal;
  if (literal !== null) {
    for (let k = 0; k < n; k += 1) {
      if (text[from + k] !== literal[k]) {
        return false;
      }
    }
    return true;
  }

  // reachable[j] === 1 means "the tokens consumed so far can have consumed
  // exactly j characters of this segment".
  let reachable = new Uint8Array(n + 1);
  let next = new Uint8Array(n + 1);
  reachable[0] = 1;

  for (const token of segment.tokens) {
    next.fill(0);
    let alive = false;

    if (token.kind === 'anyRun') {
      // `*` consumes any number of characters: once a position is reachable,
      // every position after it in this segment is too. One linear sweep.
      let seen = false;
      for (let j = 0; j <= n; j += 1) {
        if (reachable[j] === 1) {
          seen = true;
        }
        if (seen) {
          next[j] = 1;
          alive = true;
        }
      }
    } else {
      for (let j = 0; j < n; j += 1) {
        if (reachable[j] === 1 && charMatches(token, text[from + j] as number)) {
          next[j + 1] = 1;
          alive = true;
        }
      }
    }

    if (!alive) {
      return false;
    }

    const swap = reachable;
    reachable = next;
    next = swap;
  }

  // Anchored: the segment must be consumed in full.
  return reachable[n] === 1;
}

/** Match a parsed pattern against a path. */
export function matchParsed(parsed: ParsedPattern, path: string): boolean {
  const text = toCodePoints(path);

  // Segment boundaries, recorded as offsets so no substrings are allocated.
  const starts: number[] = [0];
  const ends: number[] = [];
  for (let k = 0; k < text.length; k += 1) {
    if (text[k] === CP_SLASH) {
      ends.push(k);
      starts.push(k + 1);
    }
  }
  ends.push(text.length);

  const pathCount = ends.length;
  const segments: readonly Segment[] = parsed.segments;

  // Cheap rejections that keep long non-matching paths from entering the DP.
  if (pathCount < parsed.minSegments) {
    return false;
  }
  if (!parsed.hasGlobstar && pathCount !== segments.length) {
    return false;
  }

  // reachable[j] === 1 means "the pattern segments consumed so far can have
  // consumed exactly j path segments".
  let reachable = new Uint8Array(pathCount + 1);
  let next = new Uint8Array(pathCount + 1);
  reachable[0] = 1;

  for (const segment of segments) {
    next.fill(0);
    let alive = false;

    if (segment.kind === 'globstar') {
      // `**` spans zero or more whole segments, including the trailing case:
      // `a/**` reaches the end of `a` with zero segments consumed.
      let seen = false;
      for (let j = 0; j <= pathCount; j += 1) {
        if (reachable[j] === 1) {
          seen = true;
        }
        if (seen) {
          next[j] = 1;
          alive = true;
        }
      }
    } else {
      for (let j = 0; j < pathCount; j += 1) {
        if (
          reachable[j] === 1 &&
          matchSegment(segment, text, starts[j] as number, ends[j] as number)
        ) {
          next[j + 1] = 1;
          alive = true;
        }
      }
    }

    if (!alive) {
      return false;
    }

    const swap = reachable;
    reachable = next;
    next = swap;
  }

  // Anchored: the whole path must be consumed.
  return reachable[pathCount] === 1;
}
