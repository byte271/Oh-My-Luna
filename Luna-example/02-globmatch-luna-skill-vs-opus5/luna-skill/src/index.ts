export class GlobPatternError extends Error {
  public readonly pattern: string;
  public readonly position: number;

  public constructor(pattern: string, message: string, position: number) {
    super(`Malformed glob pattern at position ${position}: ${message}`);
    this.name = "GlobPatternError";
    this.pattern = pattern;
    this.position = position;
  }
}

export interface CompiledMatcher {
  readonly pattern: string;
  match(path: string): boolean;
  test(path: string): boolean;
}

export interface CompiledPatternSet {
  match(path: string): number;
}

interface PatternCharacter {
  readonly value: string;
  readonly escaped: boolean;
}

interface CharacterRange {
  readonly start: number;
  readonly end: number;
}

interface LiteralToken {
  readonly kind: "literal";
  readonly value: string;
}

interface AnyToken {
  readonly kind: "any";
}

interface StarToken {
  readonly kind: "star";
}

interface ClassToken {
  readonly kind: "class";
  readonly negated: boolean;
  readonly singles: ReadonlySet<string>;
  readonly ranges: readonly CharacterRange[];
}

type SegmentToken = LiteralToken | AnyToken | StarToken | ClassToken;

interface OrdinarySegment {
  readonly kind: "segment";
  readonly tokens: readonly SegmentToken[];
}

interface GlobStarSegment {
  readonly kind: "globstar";
}

type CompiledSegment = OrdinarySegment | GlobStarSegment;

interface PatternRule {
  readonly negated: boolean;
  readonly matcher: CompiledMatcher;
}

function codePoints(value: string): string[] {
  return Array.from(value);
}

function splitPattern(pattern: string): PatternCharacter[][] {
  const segments: PatternCharacter[][] = [[]];
  const characters = codePoints(pattern);

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];

    if (character === "\\") {
      if (index + 1 >= characters.length) {
        throw new GlobPatternError(pattern, "unterminated trailing escape", index);
      }

      const escaped = characters[index + 1];
      index += 1;

      // A slash is always a path separator. Escaping it only prevents the
      // escaped character from being interpreted as another pattern token.
      if (escaped === "/") {
        segments.push([]);
      } else {
        segments[segments.length - 1].push({ value: escaped, escaped: true });
      }
      continue;
    }

    if (character === "/") {
      segments.push([]);
      continue;
    }

    segments[segments.length - 1].push({ value: character, escaped: false });
  }

  return segments;
}

function isGlobStarSegment(segment: readonly PatternCharacter[]): boolean {
  return (
    segment.length === 2 &&
    segment[0].value === "*" &&
    segment[1].value === "*" &&
    !segment[0].escaped &&
    !segment[1].escaped
  );
}

function codePointValue(character: string): number {
  return character.codePointAt(0) ?? 0;
}

function findClassEnd(
  segment: readonly PatternCharacter[],
  start: number,
): number {
  for (let index = start + 1; index < segment.length; index += 1) {
    if (segment[index].value === "]" && !segment[index].escaped) {
      return index;
    }
  }
  return -1;
}

function parseClass(
  segment: readonly PatternCharacter[],
  start: number,
): { readonly token: ClassToken; readonly next: number } | undefined {
  const end = findClassEnd(segment, start);
  if (end === -1) {
    return undefined;
  }

  let index = start + 1;
  let negated = false;
  if (
    index < end &&
    (segment[index].value === "!" || segment[index].value === "^") &&
    !segment[index].escaped
  ) {
    negated = true;
    index += 1;
  }

  const singles = new Set<string>();
  const ranges: CharacterRange[] = [];

  while (index < end) {
    const first = segment[index];
    const hasRange =
      index + 2 < end &&
      segment[index + 1].value === "-" &&
      !segment[index + 1].escaped;

    if (hasRange) {
      const last = segment[index + 2];
      const firstCodePoint = codePointValue(first.value);
      const lastCodePoint = codePointValue(last.value);
      ranges.push({
        start: Math.min(firstCodePoint, lastCodePoint),
        end: Math.max(firstCodePoint, lastCodePoint),
      });
      index += 3;
      continue;
    }

    singles.add(first.value);
    index += 1;
  }

  return {
    token: {
      kind: "class",
      negated,
      singles,
      ranges,
    },
    next: end + 1,
  };
}

function compileSegment(segment: readonly PatternCharacter[]): OrdinarySegment {
  const tokens: SegmentToken[] = [];

  for (let index = 0; index < segment.length; index += 1) {
    const character = segment[index];

    if (character.escaped) {
      tokens.push({ kind: "literal", value: character.value });
      continue;
    }

    if (character.value === "?") {
      tokens.push({ kind: "any" });
      continue;
    }

    if (character.value === "*") {
      const next = segment[index + 1];
      if (next !== undefined && next.value === "*" && !next.escaped) {
        // A double star is recursive only when it is the complete segment.
        // Elsewhere it is literal **, as in a/**.ts.
        tokens.push({ kind: "literal", value: "*" });
        tokens.push({ kind: "literal", value: "*" });
        index += 1;
      } else {
        tokens.push({ kind: "star" });
      }
      continue;
    }

    if (character.value === "[") {
      const parsed = parseClass(segment, index);
      if (parsed !== undefined) {
        tokens.push(parsed.token);
        index = parsed.next - 1;
        continue;
      }
      // An unterminated [ is explicitly literal.
    }

    tokens.push({ kind: "literal", value: character.value });
  }

  return { kind: "segment", tokens };
}

function compileSegments(pattern: string): CompiledSegment[] {
  return splitPattern(pattern).map((segment) =>
    isGlobStarSegment(segment)
      ? { kind: "globstar" }
      : compileSegment(segment),
  );
}

function splitPath(path: string): string[][] {
  const segments: string[][] = [[]];

  for (const character of path) {
    if (character === "/") {
      segments.push([]);
    } else {
      segments[segments.length - 1].push(character);
    }
  }

  return segments;
}

function classMatches(token: ClassToken, character: string): boolean {
  let found = token.singles.has(character);
  if (!found) {
    const value = codePointValue(character);
    for (const range of token.ranges) {
      if (value >= range.start && value <= range.end) {
        found = true;
        break;
      }
    }
  }

  return token.negated ? !found : found;
}

function tokenMatches(token: SegmentToken, character: string): boolean {
  switch (token.kind) {
    case "literal":
      return token.value === character;
    case "any":
      return character !== "/";
    case "class":
      return character !== "/" && classMatches(token, character);
    case "star":
      return false;
  }
}

function matchSegment(
  tokens: readonly SegmentToken[],
  pathSegment: readonly string[],
): boolean {
  let patternIndex = 0;
  let pathIndex = 0;
  let lastStar = -1;
  let starPathIndex = -1;

  while (pathIndex < pathSegment.length) {
    const token = tokens[patternIndex];

    if (
      token !== undefined &&
      token.kind !== "star" &&
      tokenMatches(token, pathSegment[pathIndex])
    ) {
      patternIndex += 1;
      pathIndex += 1;
      continue;
    }

    if (token?.kind === "star") {
      lastStar = patternIndex;
      starPathIndex = pathIndex;
      patternIndex += 1;
      continue;
    }

    if (lastStar !== -1) {
      starPathIndex += 1;
      pathIndex = starPathIndex;
      patternIndex = lastStar + 1;
      continue;
    }

    return false;
  }

  while (patternIndex < tokens.length && tokens[patternIndex].kind === "star") {
    patternIndex += 1;
  }

  return patternIndex === tokens.length;
}

function matchCompiledSegments(
  patternSegments: readonly CompiledSegment[],
  pathSegments: readonly (readonly string[])[],
): boolean {
  let patternIndex = 0;
  let pathIndex = 0;
  let lastGlobStar = -1;
  let globStarPathIndex = -1;

  while (pathIndex < pathSegments.length) {
    const segment = patternSegments[patternIndex];

    if (
      segment !== undefined &&
      segment.kind === "segment" &&
      matchSegment(segment.tokens, pathSegments[pathIndex])
    ) {
      patternIndex += 1;
      pathIndex += 1;
      continue;
    }

    if (segment?.kind === "globstar") {
      lastGlobStar = patternIndex;
      globStarPathIndex = pathIndex;
      patternIndex += 1;
      continue;
    }

    if (lastGlobStar !== -1) {
      globStarPathIndex += 1;
      pathIndex = globStarPathIndex;
      patternIndex = lastGlobStar + 1;
      continue;
    }

    return false;
  }

  while (
    patternIndex < patternSegments.length &&
    patternSegments[patternIndex].kind === "globstar"
  ) {
    patternIndex += 1;
  }

  return patternIndex === patternSegments.length;
}

class CompiledMatcherImpl implements CompiledMatcher {
  public readonly pattern: string;
  private readonly segments: readonly CompiledSegment[];

  public constructor(pattern: string) {
    this.pattern = pattern;
    this.segments = compileSegments(pattern);
  }

  public match(path: string): boolean {
    return matchCompiledSegments(this.segments, splitPath(path));
  }

  public test(path: string): boolean {
    return this.match(path);
  }
}

class CompiledPatternSetImpl implements CompiledPatternSet {
  private readonly rules: readonly PatternRule[];

  public constructor(patterns: readonly string[]) {
    this.rules = patterns.map((pattern) => {
      const negated = pattern.startsWith("!");
      const body = negated ? pattern.slice(1) : pattern;
      return { negated, matcher: compile(body) };
    });
  }

  public match(path: string): number {
    let firstPositiveMatch = -1;
    let included = false;

    for (let index = 0; index < this.rules.length; index += 1) {
      const rule = this.rules[index];
      if (!rule.matcher.match(path)) {
        continue;
      }

      if (rule.negated) {
        included = false;
      } else {
        if (firstPositiveMatch === -1) {
          firstPositiveMatch = index;
        }
        included = true;
      }
    }

    return included ? firstPositiveMatch : -1;
  }
}

export function compile(pattern: string): CompiledMatcher {
  if (typeof pattern !== "string") {
    throw new TypeError("pattern must be a string");
  }
  return new CompiledMatcherImpl(pattern);
}

export function match(pattern: string, path: string): boolean {
  return compile(pattern).match(path);
}

export function compileAny(
  patterns: readonly string[],
): CompiledPatternSet {
  return new CompiledPatternSetImpl(patterns);
}

export function matchAny(patterns: readonly string[], path: string): number {
  return compileAny(patterns).match(path);
}
