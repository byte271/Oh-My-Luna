#!/usr/bin/env node
// Runtime CLI — ADR 0017. Exposes the readiness triad and the durable-state
// inspection/re-verification surfaces. Deliberately SEPARATE from the evaluation
// CLI (cli.ts): these commands are offline, deterministic, and make no model
// call. Every command prints JSON to stdout and sets a distinct exit code so a
// caller (or CI) can branch on the outcome without parsing prose.
//
//   doctor                         installation readiness      (exit 0 ready / 3 not)
//   sufficiency <input.json>       prompt/context sufficiency  (exit 0 ready / 3 not)
//   smoke --offline                execution seam, offline     (exit 0 ready / 3 not)
//   inspect-run <root> <runId>     read persisted run state    (exit 0)
//   verify-run <root> <runId>      re-derive claims vs tree     (exit 0 all supported / 5 not)
//
// Exit codes are stable: 0 ok, 2 usage, 3 not-ready, 5 re-verification regressed,
// 1 internal error. A green NEVER implies more than its surface's `implies_not`.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { doctor, smoke, sufficiency, type SufficiencyInput } from "./runtime/readiness.js";
import { inspectRun, reverifyRun } from "./runtime/run-store.js";
import { toOmlError } from "./errors.js";

function usage(): never {
  process.stderr.write(
    "Usage: oh-my-luna-runtime <doctor | sufficiency <input.json> | smoke --offline | " +
      "inspect-run <root> <runId> | verify-run <root> <runId> [--require-strong]>\n"
  );
  process.exit(2);
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "doctor") {
    const result = await doctor({ probeWritableDir: resolve(args[1] ?? ".") });
    print(result);
    process.exitCode = result.ready ? 0 : 3;
    return;
  }

  if (command === "sufficiency") {
    const inputPath = args[1];
    if (!inputPath) usage();
    const input = JSON.parse(await readFile(resolve(inputPath), "utf8")) as SufficiencyInput;
    const result = await sufficiency(input);
    print(result);
    process.exitCode = result.ready ? 0 : 3;
    return;
  }

  if (command === "smoke") {
    if (args[1] !== "--offline") usage();
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const workspaceRoot = await mkdtemp(join(tmpdir(), "oml-smoke-"));
    const result = await smoke({ workspaceRoot, executablePath: process.execPath });
    print(result);
    process.exitCode = result.ready ? 0 : 3;
    return;
  }

  if (command === "inspect-run") {
    const root = args[1];
    const runId = args[2];
    if (!root || !runId) usage();
    print(await inspectRun(resolve(root), runId));
    process.exitCode = 0;
    return;
  }

  if (command === "verify-run") {
    const root = args[1];
    const runId = args[2];
    if (!root || !runId) usage();
    const requireStrong = args.includes("--require-strong");
    const result = await reverifyRun(resolve(root), runId, { requireStrongEvidence: requireStrong });
    print(result);
    // Non-zero when re-derivation does not confirm every claim against the
    // current tree — a regressed or never-supported claim must not read green.
    process.exitCode = result.all_supported_now ? 0 : 5;
    return;
  }

  usage();
}

main().catch((error: unknown) => {
  const omlError = toOmlError(error);
  process.stderr.write(
    `${JSON.stringify({ code: omlError.code, message: omlError.message, details: omlError.details })}\n`
  );
  process.exitCode = 1;
});
