// Prompt completeness — the first sufficiency check written for this project.
//
// It is now one gate of four. `check-sufficiency.mjs` holds the implementation;
// this entry point remains because the defect report, the RUNBOOK, SKILL.md and
// `docs/gate-h-heldout-v2-plan.md` all name it, and its exit codes (0 present,
// 6 absent, 7 not provisioned) are documented in those places.
//
// Three defects in the original standalone version were corrected when it moved
// into the shared implementation:
//
//   - It duplicated `buildPrompt` from `run-stage-a.mjs`, with a comment warning
//     that the copy must be kept in step "or it silently stops measuring
//     reality." A sufficiency check that can drift from the thing it measures is
//     not a check. Both callers now import `src/heldout/prompt.ts`.
//
//   - Partial provisioning produced a complete-looking verdict. It exited 7 only
//     when *nothing* resolved, so a corpus missing one repository reported a
//     clean pass over the remainder.
//
//   - It compared raw per-file source against `max_output_tokens`. The model
//     emits its file inside a JSON string, and a multi-file task emits every
//     permitted file in one response, so the quantity that must fit the cap is
//     the encoded envelope. Escaping alone inflates this corpus by 3.2%-6.4%.
//
// Usage:
//   node scripts/gate-h-heldout/check-prompt-completeness.mjs [--json] [--protocol v1|v2]

import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));

const child = spawn(
  process.execPath,
  [
    resolve(root, "scripts/gate-h-heldout/check-sufficiency.mjs"),
    "--only",
    "prompt_completeness",
    ...process.argv.slice(2)
  ],
  { cwd: root, stdio: "inherit" }
);

child.on("close", (code, signal) => {
  process.exit(signal !== null ? 1 : (code ?? 1));
});
