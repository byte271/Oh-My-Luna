# GlobMatch

Glob matching for path strings, in TypeScript, with no dependencies and no
regular expressions.

Matching runs in time bounded by `O(|pattern| × |path|)`. There is no input a
caller can supply — pattern or path, however adversarial — that makes matching
blow up, which is the usual failure mode of glob libraries that translate
patterns into regular expressions.

```ts
import { compile, match, matchAny } from 'globmatch';

match('src/**/*.ts', 'src/a/b/c.ts');        // true
match('src/*.ts', 'src/a/b/c.ts');           // false — * does not cross /

const isSource = compile('src/**/*.ts');     // parse once
isSource.match('src/index.ts');              // true

matchAny(['**/*.ts', '!**/*.d.ts'], 'a.d.ts'); // -1 — excluded by the negation
```

## Pattern syntax

| Syntax          | Meaning                                              |
| --------------- | ---------------------------------------------------- |
| `?`             | exactly one character, except `/`                    |
| `*`             | zero or more characters, except `/`                  |
| `**`            | zero or more path segments, including `/`            |
| `[abc]`         | one character from the set                           |
| `[a-z]`         | one character from the range                         |
| `[!abc]`, `[^abc]` | one character *not* in the set                    |
| `\x`            | a literal `x`, with any special meaning removed      |
| anything else   | itself                                               |

### Rules that are easy to get wrong

**Matching is anchored.** The pattern must consume the whole path. `src` does
not match `src/index.ts`.

**`**` is a globstar only when it is a whole segment.** In `a/**/b` it spans
segments. In `a/**.ts` it is an ordinary star run confined to one segment, so
it matches `a/x.ts` but not `a/b/x.ts`.

**A trailing `/**` matches zero or more segments.** `a/**` matches `a`, `a/`,
`a/b` and `a/b/c`. This falls out of `**` meaning "zero or more", not from a
special case.

**Nothing is normalized.** `.` and `..` are ordinary segment names, `//` is an
empty segment, and no filesystem is ever consulted. `a/b` does not match
`a/./b`. Paths and patterns must already use `/`.

**`?`, `*` and classes never see a `/`.** The path is split on `/` before those
constructs are consulted, so even `[!x]` cannot match a separator.

**`?` counts characters, not UTF-16 code units.** One `?` matches one code
point, so an emoji is one `?` rather than two. Grapheme clusters (a base
character plus combining marks) still count as more than one.

### Errors

| Input                       | Behaviour                                         |
| --------------------------- | ------------------------------------------------- |
| Unterminated `[`            | the `[` is a literal — `[abc` matches `[abc`       |
| Trailing `\`                | `GlobError` at compile time                        |
| Reversed range, e.g. `[z-a]`| `GlobError` at compile time                        |

A reversed range is rejected rather than silently matching nothing, since it is
almost always a typo. Note that an unterminated `[z-a` is *not* an error: it
never became a character class, so it is just literal text.

`]` immediately after `[` or `[!` is a literal `]`, following POSIX, so `[]a]`
matches `]` or `a`.

Escapes work inside classes too: `[\]]` matches `]`.

## API

### `match(pattern: string, path: string): boolean`

Compiles and matches in one call. Throws `GlobError` if the pattern is
malformed.

There is deliberately **no global pattern cache**: patterns are untrusted
input, and a cache keyed by them would be an unbounded memory-growth vector.
Use `compile` when matching many paths.

### `compile(pattern: string): CompiledPattern`

Parses once and returns `{ source, match(path) }`. All per-pattern work —
scanning, segment splitting, building character classes — happens here, so
`match` repeats none of it. The returned object is frozen and holds no
per-match state, so it is safe to reuse and interleave.

A malformed pattern throws here. A pattern that compiled will never throw
while matching.

### `matchAny(patterns: readonly string[], path: string): number`

Returns the index of the winning pattern, or `-1`.

A leading `!` negates. Order matters and later entries override earlier ones:

```ts
matchAny(['*.ts', '!*.d.ts'], 'a.ts');                      // 0
matchAny(['*.ts', '!*.d.ts'], 'a.d.ts');                    // -1
matchAny(['*.ts', '!*.d.ts', 'keep.d.ts'], 'keep.d.ts');    // 2
matchAny(['!*.d.ts', '*.ts'], 'a.d.ts');                    // 1 — negation came first
```

The result is the first *positive* match that no later negation cancels. Use
`\!` for a pattern that starts with a literal `!`.

### `compileSet(patterns: readonly string[]): CompiledSet`

The reusable form: `{ entries, matchAny(path), matches(path) }`. One malformed
pattern rejects the whole set.

### `GlobError`

Carries `pattern` and `index` (an offset in code points). Only ever thrown
during compilation.

## CLI

```
globmatch match <pattern> <path>     exit 0 if it matches, 1 if not
globmatch filter <pattern-file>      read paths on stdin, print those matching
globmatch --help
```

Exit codes: `0` match, `1` no match, `2` usage or unreadable pattern file,
`3` malformed pattern.

```console
$ globmatch match 'src/**/*.ts' src/a/b.ts ; echo $?
0
$ globmatch match 'src/**/*.ts' README.md ; echo $?
1
$ globmatch match 'bad\' x ; echo $?
globmatch: unterminated trailing backslash at offset 3 in pattern "bad\\"
3
```

A pattern file holds one pattern per line. Blank lines are ignored and `#`
starts a comment; a leading `!` negates, exactly as in `matchAny`. Use `\#` or
`\!` for a literal leading `#` or `!`. Every pattern is compiled before any
input is read, so a broken pattern is reported with its line number and nothing
is printed:

```console
$ printf '**/*.ts\n!**/*.d.ts\n' > patterns.txt
$ printf 'a.ts\nb.d.ts\nc.js\n' | globmatch filter patterns.txt
a.ts
```

`match` takes a single plain pattern, so a leading `!` there is a literal `!`,
not a negation. It mirrors the `match()` API; `filter` mirrors `matchAny()`.

## Commands

```sh
npm run typecheck    # tsc --noEmit over src, test and types
npm run build        # emit dist/ (JS + .d.ts) and mark the CLI executable
npm test             # run the test suite
npm run verify       # typecheck, then build, then test
npm run clean        # remove dist/
npm run cli -- match 'src/**/*.ts' src/a.ts   # run the CLI from source
```

TypeScript is not listed as a dependency — the project installs nothing — so
`tsc` must be available on `PATH` for `typecheck` and `build`. `npm test` needs
neither, because Node runs the TypeScript sources directly.

Requires Node 22.6 or newer (for running `.ts` files without a build step).

## Design

```
src/parser.ts    pattern text  ->  segments of tokens        (all validation)
src/matcher.ts   segments + path  ->  boolean                (two nested DPs)
src/glob.ts      compile / match
src/set.ts       compileSet / matchAny
src/cli.ts       command line front end
```

The parser splits on `/` once, up front. That single decision is why `?`, `*`
and `[...]` cannot cross a separator: they are never shown one. `**` is the
only construct the segment splitter treats specially.

Matching is two nested dynamic programs, neither of which backtracks:

- **Within a segment**, the tokens are walked while carrying the *set* of
  character offsets still reachable. `*` extends that set to the end of the
  segment in one linear sweep. Cost: `O(tokens × characters)`.
- **Across segments**, pattern segments are walked while carrying the set of
  reachable path-segment boundaries, with `**` extending it in one sweep.

Because the outer program asks the inner one about each (pattern segment, path
segment) pair at most once, total work is bounded by

```
Σᵢ |segmentᵢ| × Σⱼ |pathSegmentⱼ|  ≤  |pattern| × |path|
```

### Safety

- **No regular expressions.** Not as an implementation detail but as a
  guarantee: `test/no-regex.test.ts` scans `src/` and fails on any construct
  that implies one. A glob-to-regex translation would inherit catastrophic
  backtracking, which is exactly what this library exists to avoid.
- **Bounded work.** The classic blowup shapes — `*a*a*a…` against a long
  non-matching string, or many `**` segments against a long path — are linear
  in each dimension here. `test/adversarial.test.ts` runs them under a
  wall-clock budget.
- **Bounded memory.** The DP keeps two rows, sized by the current path segment
  and by the segment count. No global caches.
- **Validation happens once.** Malformed patterns are rejected at compile time,
  so a validated pattern cannot fail mid-scan over a large input.
- **No ambient authority.** The library touches no filesystem, no network and
  no Node API at all — only the CLI reads files. A test enforces this.
- **The CLI streams.** `filter` processes stdin incrementally and compiles all
  patterns before reading any input.

### Correctness

Besides the behavioural tables, `test/oracle.test.ts` checks the matcher
against an independently written brute-force implementation (naive exponential
recursion, no shared code) on **all 94,501** combinations of every pattern up
to four characters over `a b / ? *` and every path up to four characters over
`a b /`.

## Limitations

- No brace expansion (`{a,b}`), no extglob (`+(a|b)`), no POSIX class names
  (`[[:alpha:]]`), and no `.`-leading special-casing: `*` matches a leading dot.
- Matching is case-sensitive and byte-for-byte on code points. There is no
  Unicode normalization, so `é` composed and decomposed are different paths.
- `\/` follows the spec literally: escaping removes the separator meaning,
  yielding a literal `/` inside a segment. Since a segment can never contain
  `/`, such a pattern matches nothing. Write `/` unescaped.
- `?` matches a code point, so a grapheme cluster made of several code points
  needs several `?`.
- Character class ranges compare code points, not locale collation: `[a-Z]` is
  a reversed range and rejected, and `[A-z]` includes `[`, `\`, `]`, `^`, `_`
  and `` ` ``.
- Windows separators are not translated; convert `\` to `/` before matching.

## License

MIT
