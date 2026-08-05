Project name: GlobMatch



Create a dependency-free TypeScript library and CLI for matching path strings against glob patterns.



The pattern syntax must support:



\* `?` — matches exactly one character, except `/`

\* `*` — matches zero or more characters, except `/`

\* `**` — matches zero or more path segments, including `/`

\* `[abc]` — matches one character from the set

\* `[a-z]` — matches one character from the range

\* `[!abc]` or `[^abc]` — matches one character not in the set

\* `\\` — escapes the next character, removing any special meaning

\* everything else matches itself



Requirements:



1\. Implement the matcher.



&#x20;  \* `match(pattern, path)` returns a boolean.

&#x20;  \* Matching is anchored: the pattern must consume the entire path.

&#x20;  \* `**` may appear as a whole segment (`a/**/b`) or as part of one (`a/**.ts` is a literal `**` followed by `.ts` and matches within one segment only).

&#x20;  \* A trailing `/**` matches zero or more segments, so `a/**` matches `a`.

&#x20;  \* Patterns and paths use `/` as the separator. Do not normalize or resolve paths.

&#x20;  \* An unterminated `[` is a literal `[`. An unterminated trailing `\\` is an error.

&#x20;  \* Matching must complete in time bounded by the sizes of the pattern and the path. Pattern and path both come from untrusted input; a caller must not be able to choose inputs that make matching take unreasonably long.



2\. Implement a compile step.



&#x20;  \* `compile(pattern)` returns a reusable matcher object.

&#x20;  \* Compiling once and matching many paths must not repeat per-pattern work.

&#x20;  \* A malformed pattern must fail at compile time, not at match time.



3\. Implement pattern-set matching.



&#x20;  \* `matchAny(patterns, path)` returns the index of the first matching pattern, or `-1`.

&#x20;  \* Negated patterns beginning with `!` invert: a path matched by a later negation is excluded.

&#x20;  \* Order is significant and later patterns override earlier ones.



4\. Do not use regular expressions.



&#x20;  \* No `RegExp`, no `new RegExp`, no regex literals anywhere in the matching path.

&#x20;  \* Translating a glob into a regular expression is not an acceptable implementation.



5\. Provide a CLI:



&#x20;  \* `match <pattern> <path>` — exit 0 on match, exit 1 on no match

&#x20;  \* `filter <pattern-file> < paths-on-stdin` — print matching paths, one per line

&#x20;  \* Malformed patterns must be reported clearly and exit with a distinct status.



6\. Create automated tests covering:



&#x20;  \* literal matches and non-matches;

&#x20;  \* `?` at the start, middle, and end;

&#x20;  \* `*` matching zero characters;

&#x20;  \* `*` not crossing `/`;

&#x20;  \* `**` matching zero segments, one segment, and many;

&#x20;  \* `a/**` matching `a`;

&#x20;  \* character classes, ranges, and negated classes;

&#x20;  \* escaped metacharacters matching literally;

&#x20;  \* an unterminated `[` treated as a literal;

&#x20;  \* an unterminated trailing backslash rejected;

&#x20;  \* empty pattern and empty path;

&#x20;  \* pattern-set matching with negation and ordering;

&#x20;  \* compile-once-match-many returning the same results as direct matching;

&#x20;  \* adversarial patterns containing many consecutive `*` and `**` segments against long non-matching paths.



7\. Provide:



&#x20;  \* `package.json`;

&#x20;  \* strict `tsconfig.json`;

&#x20;  \* source files;

&#x20;  \* tests;

&#x20;  \* README;

&#x20;  \* commands for build, test, type-check, and CLI execution.



Constraints:



\* Use only Node.js built-in APIs.

\* Do not install runtime or test dependencies.

\* Do not use Git history, external repositories, web search, or copied implementations.

\* Do not merely describe the project. Create all files and run the tests.

\* Inspect the final directory and remove temporary or generated junk.

\* Do not claim completion unless the build, the type-check, and the full test suite pass.



The final response must state:



\* the architecture;

\* important safety decisions;

\* files created;

\* exact commands executed;

\* exact test results;

\* any remaining limitation.
