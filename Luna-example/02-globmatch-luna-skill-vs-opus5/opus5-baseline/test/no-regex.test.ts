/**
 * Requirement 4 is a property of the source, not of any single behaviour, so
 * it gets an explicit guard: no regular expressions anywhere in `src/`.
 *
 * The scan itself uses plain substring search, not a regular expression.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * Constructs that can only exist if a regular expression does. `.match(` is
 * deliberately absent: it is the name of this library's own API. `.split(` is
 * absent too, since it is called with a string separator; the literal-slash
 * checks below catch a regex argument to either.
 */
const FORBIDDEN = [
  'RegExp',
  '.exec(',
  '.test(',
  '.matchAll(',
  '.search(',
  'replace(/',
  'replaceAll(/',
  'match(/',
  'split(/',
  'matchAll(/',
] as const;

function sourceFiles(): string[] {
  return readdirSync(SRC)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(SRC, name));
}

test('the source contains several files to scan', () => {
  assert.ok(sourceFiles().length >= 5);
});

test('no regular expressions appear anywhere in src/', () => {
  for (const file of sourceFiles()) {
    const text = readFileSync(file, 'utf8');
    for (const needle of FORBIDDEN) {
      assert.equal(
        text.includes(needle),
        false,
        `${file} contains ${JSON.stringify(needle)}, which implies a regular expression`,
      );
    }
  }
});

test('the matcher does not reach for any Node API', () => {
  // The library core must stay usable in any JavaScript host. Only the CLI is
  // allowed to import Node built-ins.
  for (const file of sourceFiles()) {
    if (file.endsWith('cli.ts')) {
      continue;
    }
    const text = readFileSync(file, 'utf8');
    assert.equal(text.includes("from 'node:"), false, `${file} imports a Node built-in`);
  }
});
