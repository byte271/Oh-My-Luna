/**
 * @typedef {{ kind: "literal", value: string } | { kind: "any" } | { kind: "star" } | { kind: "class", negated: boolean, values: Set<number>, ranges: Array<[number, number]> }} SegmentToken
 * @typedef {{ kind: "segment", tokens: SegmentToken[] } | { kind: "globstar" }} PatternComponent
 * @typedef {{ negated: boolean, matcher: CompiledPattern, index: number }} CompiledEntry
 */

/**
 * Error raised while compiling a malformed glob pattern.
 */
export class GlobPatternError extends Error {
  /** @type {"ERR_GLOB_PATTERN"} */
  code;

  /**
   * @param {string} message
   */
  constructor(message) {
    super(message);
    this.name = "GlobPatternError";
    this.code = "ERR_GLOB_PATTERN";
  }
}

/**
 * A compiled pattern. The compiled component list is reused for every call
 * to test, so only the path is processed during matching.
 */
export class CompiledPattern {
  /** @type {string} */
  pattern;

  /** @type {PatternComponent[]} */
  components;

  /**
   * @param {string} pattern
   * @param {PatternComponent[]} components
   */
  constructor(pattern, components) {
    this.pattern = pattern;
    this.components = components;
    Object.freeze(this.components);
  }

  /**
   * @param {string} path
   * @returns {boolean}
   */
  test(path) {
    assertString(path, "path");
    return matchComponents(this.components, path);
  }
}

/**
 * Compile a glob pattern into a reusable matcher.
 *
 * @param {string} pattern
 * @returns {CompiledPattern}
 */
export function compile(pattern) {
  assertString(pattern, "pattern");
  return new CompiledPattern(pattern, compileComponents(pattern));
}

/**
 * Match one path against one pattern.
 *
 * @param {string} pattern
 * @param {string} path
 * @returns {boolean}
 */
export function match(pattern, path) {
  return compile(pattern).test(path);
}

/**
 * Match a path against an ordered pattern set.
 *
 * A positive match selects the path. A matching negated pattern clears the
 * current selection, and a later positive match can select it again. When
 * several positive patterns remain active, the first one is returned.
 *
 * @param {string[]} patterns
 * @param {string} path
 * @returns {number}
 */
export function matchAny(patterns, path) {
  if (!Array.isArray(patterns)) {
    throw new TypeError("patterns must be an array of strings");
  }
  assertString(path, "path");

  const entries = compileEntries(patterns);
  return matchCompiledEntries(entries, path);
}

/**
 * @param {string} value
 * @param {string} name
 */
function assertString(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string`);
  }
}

/**
 * @param {string} pattern
 * @returns {PatternComponent[]}
 */
function compileComponents(pattern) {
  const chars = Array.from(pattern);
  /** @type {SegmentToken[]} */
  let tokens = [];
  /** @type {PatternComponent[]} */
  const components = [];

  let index = 0;
  while (index < chars.length) {
    const character = chars[index];

    if (character === "/") {
      components.push(makeComponent(tokens));
      tokens = [];
      index += 1;
      continue;
    }

    if (character === "\\") {
      if (index + 1 >= chars.length) {
        throw new GlobPatternError(`Trailing backslash at position ${index}`);
      }
      if (chars[index + 1] === "/") {
        components.push(makeComponent(tokens));
        tokens = [];
        index += 2;
        continue;
      }
      tokens.push({ kind: "literal", value: chars[index + 1] });
      index += 2;
      continue;
    }

    if (character === "?") {
      tokens.push({ kind: "any" });
      index += 1;
      continue;
    }

    if (character === "*") {
      tokens.push({ kind: "star" });
      index += 1;
      continue;
    }

    if (character === "[") {
      const close = findClassClose(chars, index);
      if (close === -1) {
        tokens.push({ kind: "literal", value: "[" });
        index += 1;
        continue;
      }
      tokens.push(parseCharacterClass(chars, index, close));
      index = close + 1;
      continue;
    }

    tokens.push({ kind: "literal", value: character });
    index += 1;
  }

  components.push(makeComponent(tokens));
  return components;
}

/**
 * @param {SegmentToken[]} tokens
 * @returns {PatternComponent}
 */
function makeComponent(tokens) {
  if (
    tokens.length === 2 &&
    tokens[0].kind === "star" &&
    tokens[1].kind === "star"
  ) {
    return { kind: "globstar" };
  }

  /** @type {SegmentToken[]} */
  const normalized = [];
  for (const token of tokens) {
    if (
      token.kind === "star" &&
      normalized.length > 0 &&
      normalized[normalized.length - 1].kind === "star"
    ) {
      continue;
    }
    normalized.push(token);
  }
  return { kind: "segment", tokens: normalized };
}

/**
 * Find an unescaped closing bracket. A trailing backslash is still invalid,
 * even when it occurs while looking for a closing bracket.
 *
 * @param {string[]} chars
 * @param {number} start
 * @returns {number}
 */
function findClassClose(chars, start) {
  for (let index = start + 1; index < chars.length; index += 1) {
    if (chars[index] === "\\") {
      if (index + 1 >= chars.length) {
        throw new GlobPatternError(`Trailing backslash at position ${index}`);
      }
      index += 1;
      continue;
    }
    if (chars[index] === "]") {
      return index;
    }
  }
  return -1;
}

/**
 * @param {string[]} chars
 * @param {number} start
 * @param {number} close
 * @returns {SegmentToken}
 */
function parseCharacterClass(chars, start, close) {
  const body = chars.slice(start + 1, close);
  /** @type {{ value: string, escaped: boolean }[]} */
  const atoms = [];

  let index = 0;
  while (index < body.length) {
    if (body[index] === "\\") {
      if (index + 1 >= body.length) {
        throw new GlobPatternError(`Trailing backslash at position ${start + 1 + index}`);
      }
      atoms.push({ value: body[index + 1], escaped: true });
      index += 2;
      continue;
    }
    atoms.push({ value: body[index], escaped: false });
    index += 1;
  }

  let atomIndex = 0;
  let negated = false;
  if (
    atoms.length > 0 &&
    !atoms[0].escaped &&
    (atoms[0].value === "!" || atoms[0].value === "^")
  ) {
    negated = true;
    atomIndex = 1;
  }

  const values = new Set();
  /** @type {Array<[number, number]>} */
  const ranges = [];

  while (atomIndex < atoms.length) {
    const current = atoms[atomIndex];
    const next = atoms[atomIndex + 1];
    const afterNext = atoms[atomIndex + 2];

    if (
      next !== undefined &&
      afterNext !== undefined &&
      next.value === "-" &&
      !next.escaped
    ) {
      const from = current.value.codePointAt(0);
      const to = afterNext.value.codePointAt(0);
      if (from !== undefined && to !== undefined && from <= to) {
        ranges.push([from, to]);
        atomIndex += 3;
        continue;
      }
    }

    const value = current.value.codePointAt(0);
    if (value !== undefined) {
      values.add(value);
    }
    atomIndex += 1;
  }

  return { kind: "class", negated, values, ranges };
}

/**
 * @param {SegmentToken[]} tokens
 * @param {string[]} input
 * @returns {boolean}
 */
function matchesSegment(tokens, input) {
  let patternIndex = 0;
  let inputIndex = 0;
  let starIndex = -1;
  let starInputIndex = -1;

  while (inputIndex < input.length) {
    const token = tokens[patternIndex];

    if (
      token !== undefined &&
      token.kind !== "star" &&
      tokenMatchesCharacter(token, input[inputIndex])
    ) {
      patternIndex += 1;
      inputIndex += 1;
      continue;
    }

    if (token !== undefined && token.kind === "star") {
      starIndex = patternIndex;
      starInputIndex = inputIndex;
      patternIndex += 1;
      continue;
    }

    if (starIndex !== -1) {
      patternIndex = starIndex + 1;
      starInputIndex += 1;
      inputIndex = starInputIndex;
      continue;
    }

    return false;
  }

  while (patternIndex < tokens.length && tokens[patternIndex].kind === "star") {
    patternIndex += 1;
  }
  return patternIndex === tokens.length;
}

/**
 * @param {SegmentToken} token
 * @param {string} character
 * @returns {boolean}
 */
function tokenMatchesCharacter(token, character) {
  if (token.kind === "literal") {
    return token.value === character;
  }
  if (token.kind === "any") {
    return character !== "/";
  }
  if (token.kind === "class") {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) {
      return false;
    }

    let included = token.values.has(codePoint);
    if (!included) {
      for (const range of token.ranges) {
        if (codePoint >= range[0] && codePoint <= range[1]) {
          included = true;
          break;
        }
      }
    }
    return token.negated ? !included : included;
  }
  return false;
}

/**
 * @param {PatternComponent[]} components
 * @param {string} path
 * @returns {boolean}
 */
function matchComponents(components, path) {
  const pathSegments = path.split("/").map((segment) => Array.from(segment));
  let reachable = new Uint8Array(pathSegments.length + 1);
  reachable[0] = 1;

  for (const component of components) {
    const next = new Uint8Array(pathSegments.length + 1);

    if (component.kind === "globstar") {
      let seen = 0;
      for (let position = 0; position <= pathSegments.length; position += 1) {
        if (reachable[position] === 1) {
          seen = 1;
        }
        if (seen === 1) {
          next[position] = 1;
        }
      }
    } else {
      for (let position = 0; position < pathSegments.length; position += 1) {
        if (
          reachable[position] === 1 &&
          matchesSegment(component.tokens, pathSegments[position])
        ) {
          next[position + 1] = 1;
        }
      }
    }

    reachable = next;
  }

  return reachable[pathSegments.length] === 1;
}

/**
 * @param {string[]} patterns
 * @returns {CompiledEntry[]}
 */
function compileEntries(patterns) {
  return patterns.map((pattern, index) => {
    assertString(pattern, `patterns[${index}]`);
    const negated = pattern.startsWith("!");
    const source = negated ? pattern.slice(1) : pattern;
    return { negated, matcher: compile(source), index };
  });
}

/**
 * @param {CompiledEntry[]} entries
 * @param {string} path
 * @returns {number}
 */
function matchCompiledEntries(entries, path) {
  let selected = false;
  let selectedIndex = -1;

  for (const entry of entries) {
    if (!entry.matcher.test(path)) {
      continue;
    }

    if (entry.negated) {
      selected = false;
      selectedIndex = -1;
    } else if (!selected) {
      selected = true;
      selectedIndex = entry.index;
    }
  }

  return selected ? selectedIndex : -1;
}
