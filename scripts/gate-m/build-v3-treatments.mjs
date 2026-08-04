// Builds the Gate M V3 treatment corpus from the V2 packets.
//
// V3 replaces the five-level L1-L5 ladder with four operationally distinct
// treatments. The ladder was retired because its levels were not cleanly
// separable in practice: statement count tracked level, L3 and L4 resisted
// separation, and L5 wording kept drifting into implementation guidance. Those
// are authoring and measurement problems, and no amount of re-authoring fixes
// them without independent review, which the project no longer uses.
//
//   T0  native            the task only; no packet is produced here
//   T1  bounded context   relevant files, bounded regions, base-state symbols
//   T2  execution evidence T1 plus raw reproducible observations from the base
//   T3  diagnostic assist  T2 plus an author-produced causal diagnosis and
//                          behavioral objective, deliberately combined
//
// T3 is a single combined exploratory arm. Diagnosis and behavioral objective
// are NOT isolated from one another, and no claim may attribute an effect to
// one rather than the other.
//
// V1 and V2 packets and freezes are preserved untouched as research history.
//
// Usage: node scripts/gate-m/build-v3-treatments.mjs

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const v2 = resolve(root, "tasks/gate-m-v2");
const v3 = resolve(root, "tasks/gate-m-v3");

const TASKS = ["zod-tuple-default", "zod-absent-catch", "date-fns-zh-month", "type-fest-conditional-keys"];
const PROTOCOL = "gate-m-treatments-v3";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => JSON.stringify(sortKeys(value));
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys(value[k])]));
  }
  return value;
}

// Required by the V3 leakage controls: an explicit author statement, per task,
// that the behavioral objective admits materially different implementations.
// If this cannot be written honestly for a task, that task must be excluded
// from T3 rather than reworded until it passes.
const MULTIPLE_IMPLEMENTATIONS = {
  "date-fns-zh-month":
    "The objective names required parse outcomes for the twelve months and no mechanism. It can be satisfied by widening the existing pattern alternatives, by anchoring the numeric alternatives, or by replacing pattern matching for months with an explicit token table; these are materially different implementations.",
  "type-fest-conditional-keys":
    "The objective names the required key selection and no mechanism. It can be satisfied by changing how the intermediate mapped type treats declared-optional keys, or by reformulating the utility to filter keys without an intermediate mapped object; these are materially different implementations.",
  "zod-tuple-default":
    "The objective names the required output shape for omitted tuple positions and no mechanism. It can be satisfied by post-processing collected per-item results, or by deciding per position during the parse loop; these are materially different implementations.",
  "zod-absent-catch":
    "The objective names the required parse outcome for an absent property under a catch fallback and no mechanism. It can be satisfied by changing how the wrapper reports its input optionality, or by having the absent-property path consult the fallback result directly; these are materially different implementations.",
};

const treatments = [];

for (const task of TASKS) {
  const read = async (level) => JSON.parse(await readFile(resolve(v2, task, "interventions", `${level}.json`), "utf8"));
  const l2 = await read("L2");
  const l3 = await read("L3");
  const l4 = await read("L4");
  const l5 = await read("L5");

  const base = {
    schema_version: "1.0",
    protocol_version: PROTOCOL,
    task_id: task,
    task_base_commit: l2.task_base_commit,
    semantic_review_status: "author_reviewed_semantic_separation_unverified",
    provenance: {
      author_id: "oml-lead-maintainer-2026-08-02",
      author_class: "model_assisted_primary_author",
      independently_reviewed: false,
      created_at: "2026-08-02T18:00:00Z",
    },
  };

  const t1Payload = { context: l2.payload.context, localization: l2.payload.localization };
  const t2Payload = { ...t1Payload, observation: l3.payload.observation };
  const t3Payload = {
    ...t2Payload,
    diagnosis: l4.payload.diagnosis,
    behavioral_objective: {
      objective: l5.payload.plan.behavioral_objective,
      constraints: l5.payload.plan.constraints,
      non_goals: l5.payload.plan.non_goals,
      multiple_implementations_possible: true,
      multiple_implementations_justification: MULTIPLE_IMPLEMENTATIONS[task],
    },
  };

  const specs = [
    { id: "T1", name: "bounded_context", payload: t1Payload, derived_from: ["L2"] },
    { id: "T2", name: "execution_evidence", payload: t2Payload, derived_from: ["L2", "L3"] },
    { id: "T3", name: "diagnostic_assistance", payload: t3Payload, derived_from: ["L2", "L3", "L4", "L5"] },
  ];

  for (const spec of specs) {
    const packet = {
      ...base,
      treatment_id: spec.id,
      treatment_name: spec.name,
      combined_arm: spec.id === "T3",
      combined_arm_note:
        spec.id === "T3"
          ? "Diagnosis and behavioral objective are deliberately combined. No effect may be attributed to one rather than the other."
          : undefined,
      payload: spec.payload,
      derived_from: {
        protocol_version: "gate-m-real-tasks-v2",
        levels: spec.derived_from,
        packet_sha256: Object.fromEntries(
          await Promise.all(
            spec.derived_from.map(async (level) => [
              level,
              sha256(await readFile(resolve(v2, task, "interventions", `${level}.json`))),
            ])
          )
        ),
      },
    };
    packet.content_sha256 = sha256(canonical(packet.payload));

    const dir = resolve(v3, task, "treatments");
    await mkdir(dir, { recursive: true });
    await writeFile(resolve(dir, `${spec.id}.json`), `${JSON.stringify(packet, null, 2)}\n`);
    treatments.push({ task_id: task, treatment_id: spec.id, content_sha256: packet.content_sha256 });
  }
}

await writeFile(
  resolve(v3, "TREATMENTS.json"),
  `${JSON.stringify(
    {
      schema_version: "1.0",
      protocol_version: PROTOCOL,
      supersedes: ["gate-m-real-tasks-v1", "gate-m-real-tasks-v2"],
      arms: [
        { id: "T0", name: "native", packet: false, description: "Original task only." },
        { id: "T1", name: "bounded_context", packet: true, description: "Relevant files, bounded regions, base-state symbols." },
        { id: "T2", name: "execution_evidence", packet: true, description: "T1 plus raw reproducible observations generated from the base state." },
        { id: "T3", name: "diagnostic_assistance", packet: true, combined: true, description: "T2 plus an author-produced causal diagnosis and behavioral objective, deliberately combined." },
      ],
      semantic_review_status: "author_reviewed_semantic_separation_unverified",
      independently_reviewed: false,
      treatment_count: treatments.length,
      treatments: treatments.sort((a, b) => `${a.task_id}${a.treatment_id}`.localeCompare(`${b.task_id}${b.treatment_id}`)),
    },
    null,
    2
  )}\n`
);

process.stdout.write(`V3 treatments written: ${treatments.length} (${TASKS.length} tasks x 3 packet arms; T0 needs no packet)\n`);
