#!/usr/bin/env node
/**
 * GlobMatch command line interface.
 *
 * Exit codes are distinct so scripts can tell "no match" apart from "you gave
 * me a broken pattern":
 *
 *   0  match (or `filter` completed)
 *   1  no match
 *   2  usage error, or the pattern file could not be read
 *   3  malformed pattern
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { GlobError, compile, compileSet } from './index.ts';
import type { CompiledSet } from './index.ts';

const EXIT_MATCH = 0;
const EXIT_NO_MATCH = 1;
const EXIT_USAGE = 2;
const EXIT_BAD_PATTERN = 3;

const USAGE = `globmatch — match path strings against glob patterns

Usage:
  globmatch match <pattern> <path>     Exit 0 if the path matches, 1 if not.
  globmatch filter <pattern-file>      Read paths on stdin, print those that
                                       match, one per line.
  globmatch --help                     Show this message.

Pattern syntax:
  ?          one character, except /
  *          zero or more characters, except /
  **         zero or more whole path segments (only as a complete segment)
  [abc]      one character from the set
  [a-z]      one character from the range
  [!abc]     one character not in the set ([^abc] works too)
  \\x         a literal x

Pattern files:
  One pattern per line. Blank lines are ignored, and lines starting with '#'
  are comments. A leading '!' negates: a path matched by a later negation is
  excluded. Later lines override earlier ones. Use '\\!' or '\\#' for a literal
  leading '!' or '#'.

  Note that 'match' takes a single plain pattern, so a leading '!' there is a
  literal '!', not a negation.

Exit codes:
  0 match   1 no match   2 usage error   3 malformed pattern
`;

/** Internal control-flow marker; never escapes `main`. */
class ExitSignal extends Error {}

function writeErr(message: string): void {
  process.stderr.write(`globmatch: ${message}\n`);
}

/** Split text into lines, tolerating CRLF. Uses no regular expressions. */
function splitLines(text: string): string[] {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.endsWith('\r')) {
      lines[i] = line.slice(0, line.length - 1);
    }
  }
  return lines;
}

interface PatternFile {
  readonly set: CompiledSet;
}

/**
 * Load and compile a pattern file. Each pattern is compiled here, so a broken
 * pattern is reported before a single path is read.
 */
function loadPatternFile(file: string): PatternFile {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    writeErr(`cannot read pattern file ${JSON.stringify(file)}: ${reason}`);
    process.exitCode = EXIT_USAGE;
    throw new ExitSignal();
  }

  const patterns: string[] = [];
  const lineNumbers: number[] = [];
  const lines = splitLines(text);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }
    patterns.push(line);
    lineNumbers.push(i + 1);
  }

  try {
    return { set: compileSet(patterns) };
  } catch (error: unknown) {
    if (error instanceof GlobError) {
      // Point at the offending line rather than at an index in a list.
      const index = patterns.indexOf(error.pattern);
      const where = index === -1 ? file : `${file}:${lineNumbers[index] as number}`;
      writeErr(`${where}: ${error.message}`);
      process.exitCode = EXIT_BAD_PATTERN;
      throw new ExitSignal();
    }
    throw error;
  }
}

function runMatch(args: readonly string[]): void {
  if (args.length !== 2) {
    writeErr('usage: globmatch match <pattern> <path>');
    process.exitCode = EXIT_USAGE;
    return;
  }

  const pattern = args[0] as string;
  const path = args[1] as string;

  try {
    const matcher = compile(pattern);
    process.exitCode = matcher.match(path) ? EXIT_MATCH : EXIT_NO_MATCH;
  } catch (error: unknown) {
    if (error instanceof GlobError) {
      writeErr(error.message);
      process.exitCode = EXIT_BAD_PATTERN;
      return;
    }
    throw error;
  }
}

async function runFilter(args: readonly string[]): Promise<void> {
  if (args.length !== 1) {
    writeErr('usage: globmatch filter <pattern-file> < paths');
    process.exitCode = EXIT_USAGE;
    return;
  }

  const { set } = loadPatternFile(args[0] as string);

  let broken = false;
  process.stdout.on('error', () => {
    // Downstream closed the pipe (`| head`); stop quietly.
    broken = true;
  });

  const out: string[] = [];
  const flush = (): void => {
    if (out.length > 0) {
      process.stdout.write(out.join(''));
      out.length = 0;
    }
  };

  const emit = (line: string): void => {
    if (set.matchAny(line) !== -1) {
      out.push(line, '\n');
      if (out.length >= 512) {
        flush();
      }
    }
  };

  process.stdin.setEncoding('utf8');

  let buffer = '';
  let start = 0;
  for await (const chunk of process.stdin) {
    if (broken) {
      break;
    }
    buffer += chunk;
    let nl = buffer.indexOf('\n', start);
    while (nl !== -1) {
      const line = buffer.slice(start, nl);
      emit(line.endsWith('\r') ? line.slice(0, line.length - 1) : line);
      start = nl + 1;
      nl = buffer.indexOf('\n', start);
    }
    // Drop the consumed prefix so the buffer does not grow without bound.
    buffer = buffer.slice(start);
    start = 0;
  }

  if (buffer.length > start) {
    const line = buffer.slice(start);
    emit(line.endsWith('\r') ? line.slice(0, line.length - 1) : line);
  }

  flush();
  process.exitCode = EXIT_MATCH;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === undefined) {
    process.stderr.write(USAGE);
    process.exitCode = EXIT_USAGE;
    return;
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(USAGE);
    process.exitCode = EXIT_MATCH;
    return;
  }

  if (command === 'match') {
    runMatch(args.slice(1));
    return;
  }

  if (command === 'filter') {
    await runFilter(args.slice(1));
    return;
  }

  writeErr(`unknown command ${JSON.stringify(command)}`);
  process.stderr.write(USAGE);
  process.exitCode = EXIT_USAGE;
}

try {
  await main();
} catch (error: unknown) {
  if (!(error instanceof ExitSignal)) {
    const reason = error instanceof Error ? error.message : String(error);
    writeErr(reason);
    process.exitCode = EXIT_USAGE;
  }
}
