import { spawnSync } from "node:child_process";
import { rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = resolve(scriptDirectory, "..");
const build = spawnSync(process.execPath, [resolve(rootDirectory, "scripts/build.mjs")], {
  cwd: rootDirectory,
  encoding: "utf8",
  stdio: "inherit"
});
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const {
  compile,
  GlobPatternError,
  match,
  matchAny
} = await import(pathToFileURL(resolve(rootDirectory, "dist/index.js")).href);

let testCount = 0;
function test(name, callback) {
  testCount += 1;
  try {
    callback();
    process.stdout.write(`ok ${testCount} - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok ${testCount} - ${name}\n`);
    throw error;
  }
}

test("literal matches and non-matches", () => {
  assert.equal(match("src/file.ts", "src/file.ts"), true);
  assert.equal(match("src/file.ts", "src/other.ts"), false);
  assert.equal(match("a.b", "a/b"), false);
});

test("question mark matches at the start, middle, and end", () => {
  assert.equal(match("?bc", "abc"), true);
  assert.equal(match("a?c", "abc"), true);
  assert.equal(match("ab?", "abc"), true);
  assert.equal(match("?bc", "bc"), false);
  assert.equal(match("a?c", "ac"), false);
  assert.equal(match("ab?", "ab"), false);
  assert.equal(match("?", "/"), false);
});

test("star matches zero characters", () => {
  assert.equal(match("a*b", "ab"), true);
  assert.equal(match("a*b", "axxxb"), true);
  assert.equal(match("*", ""), true);
});

test("star does not cross a path separator", () => {
  assert.equal(match("a/*", "a/b"), true);
  assert.equal(match("a/*", "a/b/c"), false);
  assert.equal(match("*", "a/b"), false);
});

test("globstar matches zero, one, and many segments", () => {
  assert.equal(match("a/**/b", "a/b"), true);
  assert.equal(match("a/**/b", "a/x/b"), true);
  assert.equal(match("a/**/b", "a/x/y/z/b"), true);
  assert.equal(match("a/**/b", "a/x/c"), false);
  assert.equal(match("**", ""), true);
  assert.equal(match("**", "a/x/y"), true);
});

test("trailing globstar matches its prefix without a slash", () => {
  assert.equal(match("a/**", "a"), true);
  assert.equal(match("a/**", "a/x"), true);
  assert.equal(match("a/**", "a/x/y"), true);
  assert.equal(match("a/**", "ab"), false);
});

test("embedded consecutive stars stay within one segment", () => {
  assert.equal(match("a/**.ts", "a/file.ts"), true);
  assert.equal(match("a/**.ts", "a/deep/file.ts"), false);
  assert.equal(match("a/**.ts", "a/**.ts"), true);
});

test("character classes, ranges, and negated classes", () => {
  assert.equal(match("[abc]", "a"), true);
  assert.equal(match("[abc]", "d"), false);
  assert.equal(match("[a-z]", "m"), true);
  assert.equal(match("[a-z]", "M"), false);
  assert.equal(match("[!abc]", "d"), true);
  assert.equal(match("[!abc]", "a"), false);
  assert.equal(match("[^abc]", "d"), true);
  assert.equal(match("[^abc]", "b"), false);
});

test("escaped metacharacters match literally", () => {
  assert.equal(match("\\*", "*"), true);
  assert.equal(match("\\?", "?"), true);
  assert.equal(match("\\[abc\\]", "[abc]"), true);
  assert.equal(match("\\\\", "\\"), true);
  assert.equal(match("\\*", "anything"), false);
});

test("an escaped separator still matches a path separator", () => {
  assert.equal(match("a\\/b", "a/b"), true);
  assert.equal(match("a\\/*", "a/file"), true);
});

test("an unterminated opening bracket is literal", () => {
  assert.equal(match("[abc", "[abc"), true);
  assert.equal(match("[abc", "abc"), false);
  assert.equal(match("x/[abc", "x/[abc"), true);
});

test("an unterminated trailing backslash is rejected at compile time", () => {
  assert.throws(() => compile("abc\\"), GlobPatternError);
  assert.throws(() => match("abc\\", "abc"), GlobPatternError);
  assert.throws(() => compile("[abc\\"), GlobPatternError);
});

test("empty pattern and empty path", () => {
  assert.equal(match("", ""), true);
  assert.equal(match("", "x"), false);
  assert.equal(match("*", ""), true);
  assert.equal(match("?", ""), false);
});

test("pattern sets honor negation and ordering", () => {
  assert.equal(matchAny(["**/*.ts", "!**/test.ts"], "src/app.ts"), 0);
  assert.equal(matchAny(["**/*.ts", "!**/test.ts"], "src/test.ts"), -1);
  assert.equal(matchAny(["!**/test.ts", "**/*.ts"], "src/test.ts"), 1);
  assert.equal(matchAny(["*.js", "*.ts"], "file.ts"), 1);
  assert.equal(matchAny(["*.ts", "*.ts"], "file.ts"), 0);
});

test("compile once and match many gives direct-match results", () => {
  const pattern = "src/**/[a-z]*.ts";
  const matcher = compile(pattern);
  const paths = [
    "src/a.ts",
    "src/nested/file.ts",
    "src/9.ts",
    "src/nested/file.js",
    "other/file.ts",
    "src/"
  ];
  for (const path of paths) {
    assert.equal(matcher.test(path), match(pattern, path));
  }
});

test("adversarial wildcard input stays bounded and returns", () => {
  const manyStars = `prefix/${"*".repeat(4000)}/suffix`;
  assert.equal(match(manyStars, "prefix/value/suffiz"), false);

  const patternSegments = [];
  const pathSegments = [];
  for (let index = 0; index < 140; index += 1) {
    patternSegments.push(index % 2 === 0 ? "**" : "*");
    pathSegments.push("segment");
  }
  patternSegments.push("final");
  pathSegments.push("different");
  assert.equal(match(patternSegments.join("/"), pathSegments.join("/")), false);
});

test("CLI match reports match, non-match, and malformed pattern statuses", () => {
  const cli = resolve(rootDirectory, "dist/cli.js");
  const matching = spawnSync(process.execPath, [cli, "match", "src/*.ts", "src/file.ts"], {
    encoding: "utf8"
  });
  assert.equal(matching.status, 0);

  const nonMatching = spawnSync(process.execPath, [cli, "match", "src/*.ts", "src/file.js"], {
    encoding: "utf8"
  });
  assert.equal(nonMatching.status, 1);

  const malformed = spawnSync(process.execPath, [cli, "match", "bad\\", "bad"], {
    encoding: "utf8"
  });
  assert.equal(malformed.status, 2);
  assert.equal(malformed.stderr.includes("invalid pattern"), true);
});

test("CLI filter prints included paths and applies later negation", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "globmatch-"));
  const patternFile = join(tempDirectory, "patterns.txt");
  writeFileSync(patternFile, "**/*.ts\n!**/test.ts\n", "utf8");
  const cli = resolve(rootDirectory, "dist/cli.js");
  try {
    const result = spawnSync(process.execPath, [cli, "filter", patternFile], {
      input: "src/app.ts\nsrc/test.ts\nREADME.md\n",
      encoding: "utf8"
    });
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "src/app.ts\n");
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

process.stdout.write(`${testCount} tests passed.\n`);
