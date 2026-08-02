#!/usr/bin/env node
import { resolve } from "node:path";
import { runEvaluation } from "./runner.js";
import { toOmlError } from "./errors.js";

function usage(): never {
  process.stderr.write("Usage: oh-my-luna-eval run <fixture.json> [--runs <directory>]\n");
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "run" || !args[1]) usage();
  let runsRoot = resolve(".oml-runs");
  const runsIndex = args.indexOf("--runs");
  if (runsIndex >= 0) {
    const value = args[runsIndex + 1];
    if (!value) usage();
    runsRoot = resolve(value);
  }
  const result = await runEvaluation({ fixturePath: args[1], runsRoot });
  process.stdout.write(`${JSON.stringify({ receipt: result.receiptPath, result: result.receipt }, null, 2)}\n`);
  process.exitCode = result.receipt.status === "verified" ? 0 : 1;
}

main().catch((error: unknown) => {
  const omlError = toOmlError(error);
  process.stderr.write(`${JSON.stringify({ code: omlError.code, message: omlError.message, details: omlError.details })}\n`);
  process.exitCode = 1;
});
