// Builds the Gate M V2 packet corpus from the frozen V1 corpus.
//
// V1 is never edited. It is read, specific defects are corrected, and the
// result is written to tasks/gate-m-v2/. Every difference from V1 is recorded
// in tasks/gate-m-v2/CHANGES-FROM-V1.json with a reason, so the corpus diff is
// auditable rather than a fresh set of files with no lineage.
//
// Corrections applied:
//   1. All four L5 plans re-authored as behavioral contracts. The V1 wording
//      described mechanisms (a marker to carry, a modifier to stop preserving,
//      a lookahead to insert), which is implementation disclosure at L5.
//   2. date-fns L4 diagnosis re-derived from the stage-trace evidence. The V1
//      diagnosis described one mechanism and explained only two of the four
//      observed results.
//   3. type-fest L2 failing boundary now names base-visible symbols instead of
//      prose descriptions.
//
// Usage: node scripts/gate-m/build-v2-corpus.mjs

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const v1 = resolve(root, "tasks/gate-m");
const v2 = resolve(root, "tasks/gate-m-v2");

const TASKS = ["zod-tuple-default", "zod-absent-catch", "date-fns-zh-month", "type-fest-conditional-keys"];
const LEVELS = ["L1", "L2", "L3", "L4", "L5"];
const PROTOCOL = "gate-m-real-tasks-v2";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(sortKeys(value));
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

// ---------------------------------------------------------------------------
// Re-authored L5 behavioral contracts.
//
// Test applied to each: could two materially different implementations satisfy
// this? Each states required externally observable behavior, compatibility
// requirements and non-goals, and names no field, flag, branch, modifier or
// internal construct.
// ---------------------------------------------------------------------------
const L5_PLANS = {
  "date-fns-zh-month": {
    behavioral_objective:
      "Parsing a zh-CN date must yield the month that the written token denotes, for all twelve months, in each month form the locale accepts.",
    constraints: [
      "A token denoting October must parse as October rather than producing an invalid date.",
      "A token denoting November or December must parse as that month rather than as January.",
      "Months one through nine must continue to parse as they do now.",
      "The narrow, abbreviated, and wide month formats must all remain usable.",
      "Behavior relied on by the existing test suite must continue to hold.",
    ],
    non_goals: ["Do not change date arithmetic.", "Do not alter locale text for fields other than the month."],
  },
  "type-fest-conditional-keys": {
    behavioral_objective:
      "ConditionalKeys must select exactly the keys whose value type satisfies the condition, and must select the same keys whether or not those keys are declared optional, on the supported TypeScript version.",
    constraints: [
      "A required key whose value type satisfies the condition must be selected.",
      "An optional key must be selected when its value type satisfies a condition that admits undefined.",
      "A key whose value type does not satisfy the condition must not be selected.",
      "The result must remain a union of the selected key types.",
      "ConditionalPick must continue to behave consistently with ConditionalKeys.",
    ],
    non_goals: ["Do not require a newer TypeScript compiler.", "Do not change unrelated utility types."],
  },
  "zod-tuple-default": {
    behavioral_objective:
      "Parsing a tuple must produce a value at every declared position whose schema yields a defined result for absent input, while positions that yield nothing for absent input stay absent.",
    constraints: [
      "A declared position carrying a default must receive that default when the input omits it.",
      "An undefined supplied explicitly in the input must be preserved as an explicit undefined.",
      "Trailing positions whose schema yields no value for absent input must not be appended to the result.",
      "Rest elements must keep their current behavior and issue ordering.",
      "Synchronous and asynchronous parsing must produce the same result.",
      "Behavior relied on by the existing test suite must continue to hold.",
    ],
    non_goals: ["Do not change tuple declaration syntax."],
  },
  "zod-absent-catch": {
    behavioral_objective:
      "When a property whose schema ends in a catch fallback is absent from the input, parsing must succeed and that property must take the fallback value.",
    constraints: [
      "A value that is present but invalid must continue to receive the fallback.",
      "A property that is genuinely optional and absent must continue to be omitted rather than given a value it does not declare.",
      "Synchronous and asynchronous parsing must produce the same result.",
      "Behavior relied on by the existing test suite must continue to hold.",
    ],
    non_goals: ["Do not change the public catch callback API."],
  },
};

// ---------------------------------------------------------------------------
// Re-derived date-fns L4 diagnosis.
//
// Grounded in control/evidence/stage-trace.mjs, which separates the match stage
// from the selection stage. On the base commit both October cases report
// no_match, while November and December match their token correctly and are
// then selected as month 1. Those are two different defects, and the V1
// diagnosis described only the second.
// ---------------------------------------------------------------------------
const DATE_FNS_L4 = {
  root_cause:
    "Two independent defects combine to produce the four reported results. At the match stage the zh-CN month patterns offer no alternative that accepts October in either written form: the wide and narrow month patterns require a further character after the Chinese ten, and the abbreviated pattern's numeric alternatives cover only a single digit before the month character together with the two-digit forms eleven and twelve. An October token therefore matches nothing and parsing reports an invalid date. At the selection stage each entry of the any-width parse table pairs an anchored Chinese alternative with an unanchored numeric alternative, so the numeric alternative may match at any position inside the token; the first entry consequently matches any token containing the digit one, and because entries are tested in order, the November and December tokens are selected as the first entry and reported as month one. The match-stage defect accounts for the two invalid results and the selection-stage defect for the two month-one results; neither accounts for the other.",
  supporting_evidence_refs: [
    "base:pkgs/core/src/locale/zh-CN/_lib/match/index.ts:27-60",
    "evidence:base-run",
    "evidence:stage-trace",
  ],
  certainty: "confirmed",
};

// type-fest L2 previously described its boundary in prose. Both replacements
// are visible in the base excerpt (source/conditional-keys.d.ts:33-47).
const TYPE_FEST_LOCALIZATION = {
  symbols: [
    { path: "source/conditional-keys.d.ts", name: "ConditionalKeys", kind: "type" },
    { path: "source/conditional-keys.d.ts", name: "NonNullable", kind: "type" },
  ],
  failing_boundary: { producer_symbol: "ConditionalKeys", consumer_symbol: "NonNullable", type: "return" },
};

const changes = [];
function note(task, level, field, reason) {
  changes.push({ task_id: task, level, field, reason });
}

for (const task of TASKS) {
  for (const level of LEVELS) {
    const packet = JSON.parse(await readFile(resolve(v1, task, "interventions", `${level}.json`), "utf8"));

    packet.protocol_version = PROTOCOL;
    packet.derived_from = {
      protocol_version: "gate-m-real-tasks-v1",
      packet_sha256: sha256(await readFile(resolve(v1, task, "interventions", `${level}.json`))),
    };

    if (packet.payload.plan) {
      packet.payload.plan = L5_PLANS[task];
      note(task, level, "payload.plan", "re-authored as a behavioral contract; V1 wording disclosed implementation mechanism");
    }
    if (task === "date-fns-zh-month" && packet.payload.diagnosis) {
      packet.payload.diagnosis = DATE_FNS_L4;
      note(task, level, "payload.diagnosis", "re-derived from stage-trace evidence; V1 explained only 2 of 4 observed results");
    }
    if (task === "type-fest-conditional-keys" && packet.payload.localization) {
      packet.payload.localization = TYPE_FEST_LOCALIZATION;
      note(task, level, "payload.localization", "failing boundary now names base-visible symbols instead of prose descriptions");
    }

    packet.review_status = "pending_independent_review";
    packet.provenance = {
      ...packet.provenance,
      author_id: "oml-lead-maintainer-2026-08-02",
      author_class: "model_assisted_primary_author",
      rubric_version: "oracle-boundary/2.0.0",
      revision: 2,
      created_at: "2026-08-02T12:00:00Z",
    };
    delete packet.provenance.content_sha256;
    packet.provenance.content_sha256 = sha256(canonical(packet.payload));

    const dir = resolve(v2, task, "interventions");
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, `${level}.json`), `${JSON.stringify(packet, null, 2)}\n`);
  }
}

await writeFile(
  resolve(v2, "CHANGES-FROM-V1.json"),
  `${JSON.stringify(
    {
      schema_version: "0.1",
      protocol_version: PROTOCOL,
      supersedes: "gate-m-real-tasks-2026-08-02-pre-review-v1",
      generated_by: "scripts/gate-m/build-v2-corpus.mjs",
      change_count: changes.length,
      changes,
    },
    null,
    2
  )}\n`
);

process.stdout.write(`V2 packets written: ${TASKS.length * LEVELS.length}\nrecorded changes: ${changes.length}\n`);
