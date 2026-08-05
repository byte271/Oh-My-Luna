# GlobMatch

GlobMatch is a dependency-free TypeScript library and CLI for matching path
strings against glob patterns. It uses `/` as the path separator and never
normalizes or resolves either input.

## Architecture

- `src/index.ts` parses patterns once into path-segment tokens and matches them
  with greedy, bounded backtracking. Ordinary segments use a linear wildcard
  scan; whole-segment `**` uses the same scan at the segment level.
- `src/cli.ts` provides `match` and `filter` commands and reports malformed
  patterns with status `2`.
- `scripts/build.mjs` uses Node's built-in TypeScript type erasure to emit
  `dist/index.js` and `dist/cli.js`; no runtime or test package is installed.

## Pattern syntax

- `?` matches one character other than `/`.
- `*` matches zero or more characters other than `/`.
- `**` matches zero or more complete path segments when it is its own segment.
  For example, `a/**/b` matches `a/b` and `a/x/b`, while `a/**.ts` treats
  `**` literally.
- `[abc]`, `[a-z]`, `[!abc]`, and `[^abc]` provide character classes.
- `\\` escapes the following character. A trailing escape is malformed.
- An unterminated `[` is literal.

Matching is anchored: every character and segment must be consumed. The
matcher does not recurse over wildcard choices, so consecutive wildcard input
cannot trigger exponential backtracking. The current implementation's
segment-level scan may revisit a compiled segment while a `**` searches for a
later segment; it remains bounded by the input sizes and has no unbounded
recursion or exponential search.

## Library API

```ts
import { compile, match, matchAny } from "globmatch";

match("src/**/[a-z]*.ts", "src/lib/index.ts"); // true

const matcher = compile("docs/**/README?.md");
matcher.match("docs/README1.md"); // true

matchAny(["**/*.ts", "!**/test/**"], "src/test/unit.ts"); // -1
```

`matchAny` returns the index of the first positive rule in the final included
result, or `-1` when no positive rule matches or a later negation excludes the
path. A later positive rule can re-include a path.

## CLI

```sh
npm run build
node dist/cli.js match 'src/**/test?.ts' 'src/unit/test1.ts'

node dist/cli.js filter patterns.txt < paths.txt
```

`match` exits `0` for a match and `1` for no match. `filter` prints included
paths one per line. Both commands use status `2` for malformed patterns, status
`3` for input errors, and status `64` for usage errors. Pattern files contain
one pattern per line, including negated patterns beginning with `!`.

## Development commands

No install step is required; the project uses only Node.js built-ins.

```sh
npm run typecheck
npm run build
npm test
npm run check
```

When a system TypeScript compiler is available, `typecheck` runs it with the
strict `tsconfig.json`. Otherwise it uses Node's built-in TypeScript parser to
validate all source and test files without installing a compiler dependency.
