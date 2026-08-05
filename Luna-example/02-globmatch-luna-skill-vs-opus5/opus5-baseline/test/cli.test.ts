import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, '..', 'src', 'cli.ts');

interface Run {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

function runCli(args: readonly string[], input = ''): Run {
  const result = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', input });
  if (result.error !== undefined) {
    throw result.error;
  }
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

/** Create a pattern file, hand its path to `body`, then clean up. */
function withPatternFile(contents: string, body: (file: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'globmatch-test-'));
  try {
    const file = join(dir, 'patterns.txt');
    writeFileSync(file, contents, 'utf8');
    body(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('match exits 0 on a match', () => {
  const run = runCli(['match', 'src/**/*.ts', 'src/a/b.ts']);
  assert.equal(run.status, 0);
  assert.equal(run.stderr, '');
});

test('match exits 1 on no match', () => {
  const run = runCli(['match', 'src/**/*.ts', 'lib/a.js']);
  assert.equal(run.status, 1);
  assert.equal(run.stderr, '');
});

test('match reports a malformed pattern with a distinct exit status', () => {
  const run = runCli(['match', 'bad\\', 'x']);
  assert.equal(run.status, 3);
  assert.ok(run.stderr.includes('unterminated trailing backslash'));
  assert.ok(run.stderr.startsWith('globmatch:'));
});

test('match rejects a reversed character class range at exit status 3', () => {
  const run = runCli(['match', '[z-a]', 'x']);
  assert.equal(run.status, 3);
  assert.ok(run.stderr.includes('reversed'));
});

test('match treats a leading ! as a literal character', () => {
  assert.equal(runCli(['match', '!a', '!a']).status, 0);
  assert.equal(runCli(['match', '!a', 'a']).status, 1);
});

test('wrong argument counts are a usage error', () => {
  assert.equal(runCli(['match', 'only-one']).status, 2);
  assert.equal(runCli(['match']).status, 2);
  assert.equal(runCli(['filter']).status, 2);
  assert.equal(runCli([]).status, 2);
  assert.equal(runCli(['bogus']).status, 2);
});

test('--help exits 0 and prints usage on stdout', () => {
  const run = runCli(['--help']);
  assert.equal(run.status, 0);
  assert.ok(run.stdout.includes('Usage:'));
  assert.equal(run.stderr, '');
});

test('filter prints matching paths one per line', () => {
  withPatternFile('*.ts\n', (file) => {
    const run = runCli(['filter', file], 'a.ts\nb.js\nc.ts\n');
    assert.equal(run.status, 0);
    assert.equal(run.stdout, 'a.ts\nc.ts\n');
  });
});

test('filter honours negation and ordering in the pattern file', () => {
  withPatternFile('**/*.ts\n!**/*.d.ts\nkeep.d.ts\n', (file) => {
    const run = runCli(['filter', file], 'a.ts\nsrc/b.ts\nc.d.ts\nkeep.d.ts\nd.js\n');
    assert.equal(run.status, 0);
    assert.equal(run.stdout, 'a.ts\nsrc/b.ts\nkeep.d.ts\n');
  });
});

test('filter ignores blank lines and # comments', () => {
  withPatternFile('# only typescript\n\n*.ts\n\n', (file) => {
    const run = runCli(['filter', file], 'a.ts\nb.js\n');
    assert.equal(run.stdout, 'a.ts\n');
    assert.equal(run.status, 0);
  });
});

test('filter handles CRLF and a missing final newline', () => {
  withPatternFile('*.ts\r\n', (file) => {
    const run = runCli(['filter', file], 'a.ts\r\nb.js\r\nc.ts');
    assert.equal(run.stdout, 'a.ts\nc.ts\n');
    assert.equal(run.status, 0);
  });
});

test('filter accepts empty input', () => {
  withPatternFile('*.ts\n', (file) => {
    const run = runCli(['filter', file], '');
    assert.equal(run.status, 0);
    assert.equal(run.stdout, '');
  });
});

test('filter reports a malformed pattern with its line number and exits 3', () => {
  withPatternFile('*.ts\n# comment\nbroken\\\n', (file) => {
    const run = runCli(['filter', file], 'a.ts\n');
    assert.equal(run.status, 3);
    assert.equal(run.stdout, '');
    assert.ok(run.stderr.includes(':3:'), `expected line 3 in ${JSON.stringify(run.stderr)}`);
    assert.ok(run.stderr.includes('unterminated trailing backslash'));
  });
});

test('filter reports an unreadable pattern file as a usage error', () => {
  const run = runCli(['filter', join(tmpdir(), 'globmatch-does-not-exist-4a7f')], 'a.ts\n');
  assert.equal(run.status, 2);
  assert.ok(run.stderr.includes('cannot read pattern file'));
});

test('filter streams a large input correctly', () => {
  withPatternFile('**/*.ts\n!**/skip/**\n', (file) => {
    const lines: string[] = [];
    const expected: string[] = [];
    for (let i = 0; i < 5000; i += 1) {
      const keep = `src/dir${i}/file${i}.ts`;
      lines.push(keep, `src/skip/file${i}.ts`, `src/dir${i}/file${i}.js`);
      expected.push(keep);
    }
    const run = runCli(['filter', file], `${lines.join('\n')}\n`);
    assert.equal(run.status, 0);
    assert.equal(run.stdout, `${expected.join('\n')}\n`);
  });
});
