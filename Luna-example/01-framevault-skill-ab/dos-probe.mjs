// Demonstrates the claim in research/luna-example-framevault-ab.md that Luna-a's
// decoder is quadratic in the number of magic occurrences, while Luna-b is linear.
//
// This file is a probe, not a test. It belongs to neither arm and is not part of
// either project's suite. It exists because the analysis was established by code
// reading only, and a claim about asymptotic cost should be executed before it is
// relied on.
//
// Run:  node --experimental-strip-types Luna-example/01-framevault-skill-ab/dos-probe.mjs
//
// It does NOT run the full 16 MiB attack (~1.2M candidates, ~10^13 iterations),
// which would hang. It runs a doubling series at modest sizes and reports the
// wall-time ratio per doubling. A linear decoder trends toward 2x per doubling; a
// quadratic one trends toward 4x. The ratio is the finding, not the absolute time.

import { encodeFrame as encodeA, FrameDecoder as DecoderA, MAGIC as MAGIC_A }
  from "./Luna-a/src/index.ts";
import { encodeFrame as encodeB, FrameDecoder as DecoderB, MAGIC as MAGIC_B }
  from "./Luna-b/src/index.ts";

// One 14-byte fake frame header: FVLT | version=1 | flags=0 | length=0 | crc=0.
// Declared length 0 is legal (0 <= maxPayloadLength), so nothing here is an
// oversized length. Each occurrence is a magic hit that appends a candidate in
// Luna-a. Stride 14 => one candidate every 14 payload bytes, the densest packing.
function fakeHeaderUnit(magic) {
  const unit = new Uint8Array(14);
  unit.set(magic, 0);      // bytes 0..3  magic
  unit[4] = 1;             // version
  unit[5] = 0;             // flags
  // bytes 6..9 declared length = 0 (already zero)
  // bytes 10..13 crc = 0 (already zero); the inner frame's CRC need not be valid
  return unit;
}

// Build an outer frame that declares a legal payload of `candidates * 14` bytes,
// then fills that payload with repeated fake headers. The outer frame stays
// pending in Luna-a until its whole range completes, holding the candidate array
// open for the entire payload. We do not need the outer CRC to be valid: the cost
// is incurred while the front candidate is pending, before it ever resolves.
function buildAttack(magic, candidates) {
  const payload = new Uint8Array(candidates * 14);
  const unit = fakeHeaderUnit(magic);
  for (let i = 0; i < candidates; i++) payload.set(unit, i * 14);
  // Wrap it in a real outer header via the arm's own encoder so the outer frame
  // is well-formed and its declared length is exactly payload.length (legal).
  return { magic, payload };
}

function timeDecode(makeDecoder, encode, magic, candidates) {
  const { payload } = buildAttack(magic, candidates);
  const frame = encode(payload); // outer frame: valid header, declared length = payload.length
  const decoder = makeDecoder();
  const start = process.hrtime.bigint();
  decoder.push(frame);
  // finish/end method differs between arms; call whichever exists.
  if (typeof decoder.end === "function") decoder.end();
  else if (typeof decoder.finish === "function") decoder.finish();
  const end = process.hrtime.bigint();
  return Number(end - start) / 1e6; // ms
}

const SIZES = [1000, 2000, 4000, 8000, 16000]; // candidate counts (payload = 14x bytes)

function series(label, makeDecoder, encode, magic) {
  console.log(`\n${label}`);
  console.log("  candidates   payloadKiB      ms     ratio-vs-prev");
  let prevMs = null;
  for (const n of SIZES) {
    const ms = timeDecode(makeDecoder, encode, magic, n);
    const ratio = prevMs === null ? "   —" : (ms / prevMs).toFixed(2) + "x";
    console.log(
      `  ${String(n).padStart(9)}   ${String(((n * 14) / 1024) | 0).padStart(9)}   ${ms.toFixed(1).padStart(6)}   ${ratio.padStart(8)}`
    );
    prevMs = ms;
  }
}

console.log("FrameVault DoS probe — candidate-array scaling");
console.log("Interpretation: ratio -> ~2x/doubling is linear, ~4x/doubling is quadratic.");

series("Luna-a (skill arm) — multi-candidate resync", () => new DecoderA(), encodeA, MAGIC_A);
series("Luna-b (control)   — three-state machine", () => new DecoderB(), encodeB, MAGIC_B);

console.log(
  "\nNote: the real attack declares a 16 MiB payload (~1.2M candidates). This probe"
);
console.log(
  "stops at 16k candidates so it terminates; the per-doubling ratio is the evidence."
);
