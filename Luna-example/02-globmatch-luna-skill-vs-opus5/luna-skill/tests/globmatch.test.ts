import assert from "node:assert/strict";
import test from "node:test";
import {
  compile,
  compileAny,
  GlobPatternError,
  match,
  matchAny,
} from "../src/index.ts";

test("literal matches are anchored", () => {
  assert.equal(match("hello", "hello"), true);
  assert.equal(match("hello", "hello-world"), false);
  assert.equal(match("a/b", "a/b"), true);
  assert.equal(match("a/b", "a//b"), false);
});

test("question mark matches one non-separator character", () => {
  assert.equal(match("?at", "cat"), true);
  assert.equal(match("h?llo", "hello"), true);
  assert.equal(match("hel?", "hell"), true);
  assert.equal(match("?at", "/at"), false);
  assert.equal(match("h?llo", "h/llo"), false);
});

test("single star matches zero or more characters within one segment", () => {
  assert.equal(match("file*", "file"), true);
  assert.equal(match("*file", "file"), true);
  assert.equal(match("a*b", "ab"), true);
  assert.equal(match("a*b", "axxxb"), true);
  assert.equal(match("a*b", "a/x/b"), false);
  assert.equal(match("*", "a/b"), false);
});

test("whole-segment double star matches zero, one, or many segments", () => {
  assert.equal(match("a/**/b", "a/b"), true);
  assert.equal(match("a/**/b", "a/x/b"), true);
  assert.equal(match("a/**/b", "a/x/y/z/b"), true);
  assert.equal(match("a/**/b", "a/x/c"), false);
  assert.equal(match("a/**", "a"), true);
  assert.equal(match("a/**", "a/x/y"), true);
  assert.equal(match("**", ""), true);
});

test("double star inside a segment is literal", () => {
  assert.equal(match("a/**.ts", "a/**.ts"), true);
  assert.equal(match("a/**.ts", "a/file.ts"), false);
  assert.equal(match("a/**.ts", "a/**x.ts"), false);
});

test("character classes support sets, ranges, and negation", () => {
  assert.equal(match("[abc]", "b"), true);
  assert.equal(match("[abc]", "d"), false);
  assert.equal(match("[a-z]", "m"), true);
  assert.equal(match("[a-z]", "M"), false);
  assert.equal(match("[!abc]", "d"), true);
  assert.equal(match("[!abc]", "b"), false);
  assert.equal(match("[^abc]", "d"), true);
  assert.equal(match("[^abc]", "c"), false);
});

test("escapes make metacharacters literal", () => {
  assert.equal(match("\\*", "*"), true);
  assert.equal(match("a\\?b", "a?b"), true);
  assert.equal(match("a\\[b", "a[b"), true);
  assert.equal(match("a\\\\b", "a\\b"), true);
  assert.equal(match("\\*", "anything"), false);
});

test("unterminated classes are literal and trailing escapes are rejected", () => {
  assert.equal(match("[abc", "[abc"), true);
  assert.equal(match("[abc", "a"), false);
  assert.throws(
    () => compile("abc\\"),
    (error: unknown) => error instanceof GlobPatternError,
  );
  assert.throws(() => match("abc\\", "abc"), GlobPatternError);
});

test("empty patterns and paths are supported", () => {
  assert.equal(match("", ""), true);
  assert.equal(match("", "x"), false);
  assert.equal(match("*", ""), true);
  assert.equal(match("?", ""), false);
});

test("pattern sets honor negation and later overrides", () => {
  const patterns = ["**/*.ts", "!**/test/**"];
  assert.equal(matchAny(patterns, "src/main.ts"), 0);
  assert.equal(matchAny(patterns, "src/test/main.ts"), -1);
  assert.equal(matchAny([...patterns, "src/test/main.ts"], "src/test/main.ts"), 0);
  assert.equal(matchAny(["!vendor/**", "**/*.ts"], "vendor/file.ts"), 1);

  const compiled = compileAny(patterns);
  assert.equal(compiled.match("src/main.ts"), 0);
  assert.equal(compiled.match("src/test/main.ts"), -1);
});

test("compiled matchers are reusable and agree with direct matching", () => {
  const matcher = compile("src/**/[a-z]*.ts");
  const cases: readonly [string, boolean][] = [
    ["src/a.ts", true],
    ["src/lib/hello.ts", true],
    ["src/lib/Hello.ts", false],
    ["test/a.ts", false],
  ];

  for (const [path, expected] of cases) {
    assert.equal(matcher.match(path), expected);
    assert.equal(matcher.test(path), expected);
    assert.equal(matcher.match(path), match("src/**/[a-z]*.ts", path));
  }
});

test("adversarial wildcard inputs finish without exponential backtracking", () => {
  const patternParts: string[] = [];
  const pathParts: string[] = [];
  for (let index = 0; index < 180; index += 1) {
    patternParts.push(index % 2 === 0 ? "**" : "*");
    pathParts.push(`segment${index}`);
  }
  patternParts.push("this-does-not-match");

  const pattern = patternParts.join("/");
  const path = pathParts.join("/");
  const start = Date.now();
  assert.equal(match(pattern, path), false);
  assert.ok(Date.now() - start < 1000);
});
