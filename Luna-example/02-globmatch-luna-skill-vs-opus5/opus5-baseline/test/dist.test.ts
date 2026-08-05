/**
 * Coverage for the compiled output.
 *
 * The library is developed as TypeScript run directly by Node, so this checks
 * that what `npm run build` emits is importable and behaves identically. When
 * `dist/` has not been built yet the test reports that and does nothing else,
 * so `npm test` still works on a clean checkout.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { compileSet, match } from '../src/index.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

function distIsBuilt(): boolean {
  try {
    return readdirSync(DIST).includes('index.js');
  } catch {
    return false;
  }
}

test('the built package behaves exactly like the sources', async () => {
  if (!distIsBuilt()) {
    process.stdout.write('# dist/ not built; run `npm run build` for this check\n');
    return;
  }

  const specifier = join(DIST, 'index.js');
  const built = await import(specifier);

  const cases: readonly (readonly [string, string])[] = [
    ['src/**/*.ts', 'src/a/b.ts'],
    ['src/**/*.ts', 'src/a/b.js'],
    ['a/**', 'a'],
    ['[!a-z]?', '1x'],
    ['a\\*b', 'a*b'],
    ['', ''],
  ];

  for (const [pattern, path] of cases) {
    assert.equal(built.match(pattern, path), match(pattern, path), `${pattern} vs ${path}`);
  }

  assert.equal(built.matchAny(['*.ts', '!*.d.ts'], 'a.d.ts'), -1);
  assert.equal(built.compile('a/**').match('a'), true);
  assert.equal(
    built.compileSet(['*.ts', '!*.d.ts']).matchAny('a.ts'),
    compileSet(['*.ts', '!*.d.ts']).matchAny('a.ts'),
  );
  assert.throws(() => built.compile('bad\\'), built.GlobError);
});
