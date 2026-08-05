#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { compile, GlobPatternError } from "./index.js";

const EXIT_USAGE = 64;
const EXIT_NO_MATCH = 1;
const EXIT_INVALID_PATTERN = 2;

/**
 * @param {string} text
 * @returns {string[]}
 */
function splitLines(text) {
  const lines = [];
  let lineStart = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") {
      continue;
    }
    let line = text.slice(lineStart, index);
    if (line.endsWith("\r")) {
      line = line.slice(0, -1);
    }
    lines.push(line);
    lineStart = index + 1;
  }

  if (lineStart < text.length) {
    let line = text.slice(lineStart);
    if (line.endsWith("\r")) {
      line = line.slice(0, -1);
    }
    lines.push(line);
  }

  return lines;
}

/**
 * @param {string} message
 */
function report(message) {
  process.stderr.write(`globmatch: ${message}\n`);
}

/**
 * @param {string[]} args
 * @returns {number}
 */
function runMatch(args) {
  if (args.length !== 2) {
    report("usage: globmatch match <pattern> <path>");
    return EXIT_USAGE;
  }

  try {
    const matcher = compile(args[0]);
    return matcher.test(args[1]) ? 0 : EXIT_NO_MATCH;
  } catch (error) {
    if (error instanceof GlobPatternError) {
      report(`invalid pattern: ${error.message}`);
      return EXIT_INVALID_PATTERN;
    }
    report(error instanceof Error ? error.message : String(error));
    return EXIT_INVALID_PATTERN;
  }
}

/**
 * @param {string[]} args
 * @returns {number}
 */
function runFilter(args) {
  if (args.length !== 1) {
    report("usage: globmatch filter <pattern-file> < paths-on-stdin");
    return EXIT_USAGE;
  }

  let patternText;
  try {
    patternText = readFileSync(args[0], "utf8");
  } catch (error) {
    report(`cannot read pattern file ${JSON.stringify(args[0])}`);
    return EXIT_INVALID_PATTERN;
  }

  const patternLines = splitLines(patternText);
  const entries = [];
  for (let index = 0; index < patternLines.length; index += 1) {
    const pattern = patternLines[index];
    const negated = pattern.startsWith("!");
    const source = negated ? pattern.slice(1) : pattern;
    try {
      entries.push({ negated, matcher: compile(source), index });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report(`invalid pattern on line ${index + 1}: ${message}`);
      return EXIT_INVALID_PATTERN;
    }
  }

  const input = readFileSync(0, "utf8");
  for (const path of splitLines(input)) {
    let selected = false;
    for (const entry of entries) {
      if (!entry.matcher.test(path)) {
        continue;
      }
      selected = !entry.negated;
    }
    if (selected) {
      process.stdout.write(`${path}\n`);
    }
  }

  return 0;
}

const args = process.argv.slice(2);
let exitCode = EXIT_USAGE;
if (args[0] === "match") {
  exitCode = runMatch(args.slice(1));
} else if (args[0] === "filter") {
  exitCode = runFilter(args.slice(1));
} else {
  report("usage: globmatch <match|filter> ...");
}
process.exitCode = exitCode;
