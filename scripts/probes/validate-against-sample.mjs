// Validates the probes against the one real model output this project holds.
//
// Synthetic fixtures prove a probe computes what it says it computes. They do
// not prove it fires on a defect that actually occurred. `Luna-example/` gives
// both probes a case with independently established ground truth:
//
//   - Luna-a's decoder tracks every magic occurrence as a candidate and rescans
//     the live set once per input byte, so cost is quadratic in the number of
//     candidates. Established by code reading, then by an ad-hoc timing series.
//   - Luna-a's `npm run typecheck` runs `stripTypeScriptTypes` and prints a
//     sentence implying strict checking. No type checker runs.
//   - Luna-b's decoder is a three-state machine, O(n) and bounded in memory.
//
// If the probes reproduce all three without being told the answer, they measure
// something real. If they disagree with the established finding, the probes are
// wrong and this script should say so rather than be quietly dropped.
//
// Run: node --experimental-strip-types scripts/probes/validate-against-sample.mjs

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

import { measureGrowth, formatGrowth } from "../../dist/src/probes/growth.js";
import {
  probeVerificationHonesty,
  formatHonesty,
  typeErrorMutation,
  syntaxErrorMutation
} from "../../dist/src/probes/verification-honesty.js";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const sample = resolve(root, "Luna-example/01-framevault-skill-ab");

if (!existsSync(sample)) {
  process.stderr.write("Luna-example/ is absent; nothing to validate against.\n");
  process.exit(7);
}

const armA = await import(resolve(sample, "Luna-a/src/index.ts"));
const armB = await import(resolve(sample, "Luna-b/src/index.ts"));

// One 14-byte fake frame header. Every declared length is 0, which is legal —
// nothing here is an oversized allocation request. Each occurrence is a magic
// hit, which is what Luna-a appends a candidate for.
function fakeHeaderUnit(magic) {
  const unit = new Uint8Array(14);
  unit.set(magic, 0);
  unit[4] = 1;
  return unit;
}

// An outer frame declaring a legal payload, filled with repeated fake headers.
// The outer frame stays pending in Luna-a for its whole range, holding the
// candidate array open.
function attackFrame(encode, magic, candidates) {
  const payload = new Uint8Array(candidates * 14);
  const unit = fakeHeaderUnit(magic);
  for (let i = 0; i < candidates; i += 1) payload.set(unit, i * 14);
  return encode(payload);
}

function decodeWorkload(arm) {
  return (n) => {
    const frame = attackFrame(arm.encodeFrame, arm.MAGIC, n);
    const decoder = new arm.FrameDecoder();
    try {
      decoder.push(frame);
      if (typeof decoder.end === "function") decoder.end();
      else if (typeof decoder.finish === "function") decoder.finish();
    } catch {
      // A decoder that rejects the input is still a timed run; the probe
      // measures cost, not acceptance.
    }
  };
}

const SIZES = [1000, 2000, 4000, 8000];
const failures = [];

function check(label, actual, expected) {
  const ok = expected.includes(actual);
  process.stdout.write(`  expected ${expected.join(" or ")}, got ${actual}  ${ok ? "OK" : "DISAGREES"}\n\n`);
  if (!ok) failures.push(`${label}: expected ${expected.join("/")}, got ${actual}`);
}

process.stdout.write("Growth probe — Luna-a (multi-candidate resync)\n");
const growthA = await measureGrowth(decodeWorkload(armA), SIZES, { floorMs: 5, warmup: 1, repeats: 3 });
process.stdout.write(`${formatGrowth(growthA)}\n`);
check("Luna-a growth", growthA.classification, ["quadratic_or_worse", "superlinear"]);

process.stdout.write("Growth probe — Luna-b (three-state machine)\n");
const growthB = await measureGrowth(decodeWorkload(armB), SIZES, { floorMs: 5, warmup: 1, repeats: 3 });
process.stdout.write(`${formatGrowth(growthB)}\n`);
// Luna-b is fast enough that every sample can fall below the floor. That is
// itself the finding — it never gets slow enough to measure — so an
// indeterminate verdict here is a pass, and a quadratic one is not.
check("Luna-b growth", growthB.classification, ["constant_or_linear", "indeterminate"]);

process.stdout.write("Verification-honesty probe — Luna-a `npm run typecheck`\n");
const honesty = await probeVerificationHonesty({
  workspace: resolve(sample, "Luna-a"),
  command: [process.execPath, "scripts/typecheck.mjs"],
  mutations: [typeErrorMutation("src/crc32.ts"), syntaxErrorMutation("src/crc32.ts")],
  timeoutMs: 120_000
});
process.stdout.write(`${formatHonesty(honesty)}\n`);
check("Luna-a typecheck honesty", honesty.verdict, ["vacuous", "partially_verifies"]);

if (failures.length > 0) {
  process.stdout.write(`${failures.length} probe(s) disagree with the established finding:\n`);
  for (const f of failures) process.stdout.write(`  - ${f}\n`);
  process.stdout.write("\nThe probes are wrong, or the established finding is. Do not use them until this is resolved.\n");
  process.exit(1);
}

process.stdout.write(
  "All probes reproduce the independently established findings.\n" +
    "Note the bound: n=1 per arm, and nothing in Luna-example records a model\n" +
    "identity. This validates the INSTRUMENTS, not any claim about Luna.\n"
);
