#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  compileAny,
  GlobPatternError,
  match,
} from "./index.js";

const USAGE_STATUS = 64;
const MALFORMED_PATTERN_STATUS = 2;
const IO_STATUS = 3;

function usage(): string {
  return [
    "Usage:",
    "  globmatch match <pattern> <path>",
    "  globmatch filter <pattern-file>",
  ].join("\n");
}

function splitLines(value: string): string[] {
  if (value.length === 0) {
    return [];
  }

  const lines: string[] = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== "\n") {
      continue;
    }

    const line = value.slice(start, index);
    lines.push(line.endsWith("\r") ? line.slice(0, -1) : line);
    start = index + 1;
  }

  if (start < value.length) {
    const line = value.slice(start);
    lines.push(line.endsWith("\r") ? line.slice(0, -1) : line);
  }

  return lines;
}

async function readStdin(): Promise<string> {
  process.stdin.setEncoding("utf8");
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function reportMalformed(error: unknown): void {
  process.stderr.write(`Malformed pattern: ${errorMessage(error)}\n`);
  process.exitCode = MALFORMED_PATTERN_STATUS;
}

async function run(args: readonly string[]): Promise<void> {
  const command = args[0];

  if (command === "match") {
    if (args.length !== 3) {
      process.stderr.write(`${usage()}\n`);
      process.exitCode = USAGE_STATUS;
      return;
    }

    try {
      process.exitCode = match(args[1], args[2]) ? 0 : 1;
    } catch (error) {
      if (error instanceof GlobPatternError) {
        reportMalformed(error);
        return;
      }
      process.stderr.write(`Error: ${errorMessage(error)}\n`);
      process.exitCode = IO_STATUS;
    }
    return;
  }

  if (command === "filter") {
    if (args.length !== 2) {
      process.stderr.write(`${usage()}\n`);
      process.exitCode = USAGE_STATUS;
      return;
    }

    let patterns: string[];
    try {
      patterns = splitLines(readFileSync(args[1], "utf8"));
    } catch (error) {
      process.stderr.write(`Could not read pattern file: ${errorMessage(error)}\n`);
      process.exitCode = IO_STATUS;
      return;
    }

    let matcher: ReturnType<typeof compileAny>;
    try {
      matcher = compileAny(patterns);
    } catch (error) {
      if (error instanceof GlobPatternError) {
        reportMalformed(error);
        return;
      }
      process.stderr.write(`Error: ${errorMessage(error)}\n`);
      process.exitCode = IO_STATUS;
      return;
    }

    const paths = splitLines(await readStdin());
    for (const path of paths) {
      if (matcher.match(path) !== -1) {
        process.stdout.write(`${path}\n`);
      }
    }
    process.exitCode = 0;
    return;
  }

  process.stderr.write(`${usage()}\n`);
  process.exitCode = USAGE_STATUS;
}

await run(process.argv.slice(2));
