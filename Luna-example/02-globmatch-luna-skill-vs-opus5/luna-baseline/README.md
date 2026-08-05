# GlobMatch

GlobMatch is a dependency-free TypeScript library and Node.js CLI for matching path strings against glob patterns. It uses only Node.js built-in APIs and does not translate patterns into regular expressions.

## Architecture

`compile(pattern)` parses a pattern into path-segment components:

- literal, `?`, `*`, and character-class tokens are stored on ordinary segments;
- exactly `**` as a complete segment becomes a globstar component;
- embedded consecutive stars, such as the stars in `a/**.ts`, remain ordinary single-segment wildcards.

Each compiled matcher can be reused with `compiled.test(path)`. Matching tracks reachable path-segment positions iteratively. Ordinary segments use a greedy wildcard scan, while globstars use a prefix-reachability transition. There is no recursive backtracking, so adversarial wildcard input cannot cause exponential behavior.

Pattern-set matching compiles every entry once, scans entries in order, and lets matching negations clear the current selection. A later positive pattern can select the path again. The returned index is the first positive pattern in the currently active selection.

## Supported syntax

| Pattern | Meaning |
| --- | --- |
| `?` | One character other than `/` |
| `*` | Zero or more characters other than `/` |
| `**` | Zero or more path segments when it is a complete segment |
| `[abc]` | One character from the set |
| `[a-z]` | One character from the range |
| `[!abc]`, `[^abc]` | One character not in the set |
| `\x` | Literal `x` |

Matching is anchored to the complete path. Paths are not normalized or resolved. An unterminated `[` is literal. A trailing backslash is rejected by `compile` with `GlobPatternError`. Escaping `/` keeps it literal while it still matches the path separator.

## API

```ts
import { compile, match, matchAny } from "globmatch";

match("src/**/*.ts", "src/lib/file.ts");

const reusable = compile("src/**/*.ts");
reusable.test("src/file.ts");

matchAny(["**/*.ts", "!**/test.ts"], "src/file.ts");
```

## Commands

With a Node.js installation available:

```text
npm run build
npm run typecheck
npm test
node dist/cli.js match "src/**/*.ts" "src/lib/file.ts"
node dist/cli.js filter patterns.txt < paths.txt
```

The same project scripts can be run without npm:

```text
node scripts/build.mjs
node scripts/typecheck.mjs
node scripts/test.mjs
```

`match` exits `0` for a match, `1` for no match, `2` for a malformed pattern, and `64` for invalid CLI usage. `filter` reads one pattern per line, reads paths from standard input, and prints selected paths one per line. Its malformed-pattern status is `2`.

## Limitation

This repository intentionally has no bundled TypeScript compiler. `scripts/typecheck.mjs` runs a real `tsc --noEmit` check when `tsc` is available; otherwise it validates the strict `tsconfig` contract and parses the TypeScript sources with the Node.js runtime. Installing a compiler is not required for runtime use or for the dependency-free build.
