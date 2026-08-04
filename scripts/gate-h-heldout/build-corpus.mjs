// Builds the held-out corpus: visible issues, evaluators, and T0-T3 material.
//
// Every T2 observation below was captured from a real run of the base commit,
// not asserted from reading the diff. Every T3 diagnosis was written from the
// base source, and states no repair.
//
// The evaluator's regression test is injected at evaluation time from the
// corrected commit and never enters a model workspace, so the visible task
// cannot leak the repair.
//
// Usage: node scripts/gate-h-heldout/build-corpus.mjs

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const out = resolve(root, "tasks/gate-h-heldout/tasks");

const sha256 = (v) => createHash("sha256").update(v).digest("hex");
const canonical = (v) => JSON.stringify(sortKeys(v));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

// issue      : symptom only, as a maintainer would report it
// context    : T1 paths and bounded regions
// symbols    : T1 base-state symbols
// observation: T2, captured from an actual base run (command recorded)
// diagnosis  : T3 causal account, no repair
// objective  : T3 required behaviour, no mechanism
const MATERIAL = {
  "scule-57cfd152": {
    issue: `# splitByCase splits on characters that carry no case

Splitting an identifier that contains a hyphen produces one segment per
punctuation character instead of treating the whole string as a single word.

\`splitByCase("new-name-value")\` is expected to yield \`["new-name-value"]\`
when the hyphen is not configured as a splitter, but it yields three segments.

The case-detection helper appears to treat characters that have no upper or
lower form as uppercase.`,
    context: [{ path: "src/index.ts", start_line: 1, end_line: 60 }],
    symbols: [
      { path: "src/index.ts", name: "isUppercase", kind: "function" },
      { path: "src/index.ts", name: "splitByCase", kind: "function" }
    ],
    boundary: { producer_symbol: "isUppercase", consumer_symbol: "splitByCase", type: "return" },
    observation: {
      statement:
        'Running the package test suite against the base commit reports: expected [ "new", "-name", "-value" ] to match object [ "new-name-value" ]. The input is split at each hyphen.',
      command: "npx vitest run test",
      certainty: "observed"
    },
    diagnosis:
      "The case predicate decides that a character is uppercase by comparing it with its own upper-cased form. A character that has no cased form is unchanged by upper-casing, so the comparison holds and the character is classified as uppercase. The splitter treats a lower-to-upper transition as a word boundary, so every caseless character inside an identifier is read as the start of a new segment.",
    objective: {
      objective:
        "Characters that have no upper or lower form must not be treated as uppercase, so that identifiers containing such characters are not split at them.",
      constraints: [
        "Genuine upper-case letters must still be reported as uppercase.",
        "Genuine lower-case letters must still be reported as not uppercase.",
        "Numeric characters must keep their current undefined result.",
        "Behaviour relied on by the existing test suite must continue to hold."
      ],
      non_goals: ["Do not change the configurable splitter list.", "Do not change the public signature."]
    }
  },

  "ufo-5cd9e676": {
    issue: `# withoutBase can return a protocol-relative URL

Stripping a base prefix from a path can produce a result beginning with two
slashes. A value such as \`//evil.com\` is interpreted by browsers as a
protocol-relative URL pointing at another host, so a value that should be a
local path becomes an off-site reference.

\`withoutBase("/legacy//evil.com", "/legacy")\` returns \`//evil.com\` where a
rooted local path is expected.`,
    context: [{ path: "src/utils.ts", start_line: 310, end_line: 340 }],
    symbols: [{ path: "src/utils.ts", name: "withoutBase", kind: "function" }],
    boundary: { producer_symbol: "withoutBase", consumer_symbol: "caller", type: "return" },
    observation: {
      statement:
        'Running the package test suite against the base commit reports: expected "//evil.com" to be "/evil.com"; expected "///evil.com" to be "/evil.com"; expected "//" to be "/". The number of leading slashes in the remainder is preserved in the result.',
      command: "npx vitest run test",
      certainty: "observed"
    },
    diagnosis:
      "After the base prefix is removed, the remainder is returned as-is when it already begins with a slash, and is otherwise given one leading slash. The check only asks whether a leading slash is present, not how many, so a remainder that begins with several slashes is returned unchanged and the result is no longer a single-rooted local path.",
    objective: {
      objective:
        "Removing a base prefix must always yield a path rooted at exactly one slash, whatever the remainder begins with.",
      constraints: [
        "A remainder that already begins with a single slash must be unchanged.",
        "A remainder with no leading slash must gain exactly one.",
        "Inputs that do not carry the base prefix must still be returned unchanged.",
        "Query and fragment handling must not change.",
        "Behaviour relied on by the existing test suite must continue to hold."
      ],
      non_goals: ["Do not change how the base itself is normalized.", "Do not alter unrelated URL helpers."]
    }
  },

  "scule-3815767f": {
    issue: `# pascalCase and camelCase keep interior capitals

Converting an all-capitals or mixed-capitals word does not normalize the rest
of each segment.

\`pascalCase("FOOBAR")\` yields \`FOOBAR\` where \`FooBar\` is expected, and
\`camelCase("fOOBAR")\` yields \`fOOBAR\` where \`fooBar\` is expected. Only the
first character of each segment is adjusted; the remainder is passed through
unchanged.`,
    context: [
      { path: "src/index.ts", start_line: 80, end_line: 110 },
      { path: "src/types.ts", start_line: 10, end_line: 30 }
    ],
    symbols: [
      { path: "src/index.ts", name: "pascalCase", kind: "function" },
      { path: "src/index.ts", name: "camelCase", kind: "function" },
      { path: "src/index.ts", name: "upperFirst", kind: "function" }
    ],
    boundary: { producer_symbol: "splitByCase", consumer_symbol: "pascalCase", type: "call" },
    observation: {
      statement:
        'Running the package test suite against the base commit reports: expected "FOOBAR" to match "FooBar"; expected "fOOBAR" to match "fooBar"; expected "FooBARb" to match "FooBaRb". Characters after the first in each segment retain their original case.',
      command: "npx vitest run test",
      certainty: "observed"
    },
    diagnosis:
      "Each segment produced by the splitter is passed through a helper that upper-cases only its first character and returns the remainder untouched. Nothing in the conversion normalizes the tail of a segment, so any capitals the input already contained survive into the output. The type-level implementation mirrors the runtime one, so the declared result type carries the same unnormalized tail.",
    objective: {
      objective:
        "Converting to pascal or camel case must normalize every segment so that only the intended leading character of each segment is capitalized and the rest is lower case, for both the runtime result and the declared type.",
      constraints: [
        "The first segment of a camel-case result must remain lower case.",
        "Segment boundaries must continue to be decided by the existing splitter.",
        "Array inputs must behave the same as split string inputs.",
        "The declared return type must agree with the runtime result.",
        "Behaviour relied on by the existing test suite must continue to hold."
      ],
      non_goals: ["Do not change the splitter.", "Do not change unrelated case helpers."]
    }
  },

  "tomlkit-43668dde": {
    issue: `# Adding a key after a dotted table drops the separating newline

Appending a key to a document whose last element is a dotted table produces
output where the new key is concatenated onto the previous line.

Starting from a document containing \`[x]\` and \`a.b = {}\`, adding \`c = 3\`
renders as \`a.b = {}c = 3\` instead of placing \`c = 3\` on its own line. The
resulting text is not valid TOML.`,
    context: [{ path: "tomlkit/container.py", start_line: 350, end_line: 400 }],
    symbols: [
      { path: "tomlkit/container.py", name: "Container", kind: "class" },
      { path: "tomlkit/container.py", name: "_handle_dotted_key", kind: "method" }
    ],
    boundary: { producer_symbol: "Container.append", consumer_symbol: "Container.as_string", type: "return" },
    observation: {
      // Self-contained reproduction. An earlier draft cited the evaluator's test
      // file here, which the leakage check correctly flagged as evaluator-only
      // information reaching a model-visible field.
      statement:
        "Against the base commit, parsing \"[x]\\na.b = {}\" and then assigning doc[\"x\"][\"c\"] = 3 renders as '[x]\\na.b = {}c = 3\\n'. The newline that should follow the dotted entry is absent, so the appended key shares a line with it.",
      command: "python3 -c \"import tomlkit; d=tomlkit.parse('[x]\\\\na.b = {}'); d['x']['c']=3; print(repr(d.as_string()))\"",
      certainty: "observed"
    },
    diagnosis:
      "A dotted key is stored as a super table wrapping the real entry, and the trailing whitespace that ends the line is recorded on the wrapper rather than on the entry inside it. When a new key is appended, the code inspects the last element of the body to decide whether a separator is required; it sees the wrapper, whose own inner element does not end in a newline, and concludes that no separator is needed. The newline held by the wrapper is never transferred to the entry that is actually rendered, so the appended key is written immediately after it.",
    objective: {
      objective:
        "Appending a key to a document whose last element is a dotted entry must produce valid TOML in which the appended key begins on its own line.",
      constraints: [
        "Existing separation behaviour for ordinary tables and keys must not change.",
        "Round-tripping a document that is not modified must remain byte-identical.",
        "Comments and existing blank lines must be preserved.",
        "Behaviour relied on by the existing test suite must continue to hold."
      ],
      non_goals: ["Do not change the parser.", "Do not change how dotted keys are represented."]
    }
  },

  "boltons-ead236e2": {
    issue: `# backoff_iter crashes when the growth factor is 1.0

Calling the backoff helper with a growth factor of \`1.0\` and no explicit
count raises \`ZeroDivisionError\` from inside the library instead of either
producing a sequence or reporting a clear argument error.

A factor of \`1.0\` means the delay never grows, so the number of steps needed
to reach the stop value cannot be derived unless the start and stop values are
already equal.`,
    context: [{ path: "boltons/iterutils.py", start_line: 630, end_line: 680 }],
    symbols: [{ path: "boltons/iterutils.py", name: "backoff_iter", kind: "function" }],
    boundary: { producer_symbol: "backoff_iter", consumer_symbol: "caller", type: "raise" },
    observation: {
      statement:
        "Calling backoff_iter(1.0, 1.0, factor=1.0) against the base commit raises ZeroDivisionError: float division by zero. The error originates inside the library rather than being reported as an invalid argument.",
      command: "python3 -c \"from boltons.iterutils import backoff_iter; list(backoff_iter(1.0, 1.0, factor=1.0))\"",
      certainty: "observed"
    },
    diagnosis:
      "When no count is supplied the number of steps is derived from a logarithm taken to the base of the growth factor. A factor of 1.0 makes that logarithm's denominator zero, so the derivation divides by zero before any argument validation notices that a non-growing factor cannot determine a step count. The case where start and stop are already equal needs no growth at all and is therefore well defined, but it is not distinguished from the case that genuinely cannot be derived.",
    objective: {
      objective:
        "A non-growing factor with no explicit count must not raise an arithmetic error from inside the library. Where the requested range needs no growth the call must succeed; where it cannot be satisfied the caller must receive a clear argument error.",
      constraints: [
        "Existing behaviour for factors greater than 1.0 must not change.",
        "An explicitly supplied count must keep working, including the repeat form.",
        "The existing validation of start and stop ordering must be preserved.",
        "Behaviour relied on by the existing test suite must continue to hold."
      ],
      non_goals: ["Do not change the jitter behaviour.", "Do not change the public signature."]
    }
  }
};

const corpus = JSON.parse(await readFile(resolve(root, "tasks/gate-h-heldout/selected-corpus.json"), "utf8"));
const built = [];

for (const task of corpus.tasks) {
  const m = MATERIAL[task.task_id];
  if (!m) throw new Error(`no authored material for ${task.task_id}`);

  const dir = resolve(out, task.task_id);
  await mkdir(resolve(dir, "visible"), { recursive: true });
  await mkdir(resolve(dir, "arms"), { recursive: true });
  await mkdir(resolve(dir, "control"), { recursive: true });

  await writeFile(resolve(dir, "visible", "issue.md"), `${m.issue.trim()}\n`);

  // Controller-only: which tests the evaluator injects. Never shown to a model.
  await writeFile(
    resolve(dir, "control", "evaluator.json"),
    `${JSON.stringify(
      {
        schema_version: "1.0",
        warning: "CONTROLLER ONLY. Names the regression tests that detect the defect.",
        task_id: task.task_id,
        repository: task.repository,
        base_commit: task.base_commit,
        corrected_commit: task.corrected_commit,
        runner: task.runner,
        language: task.language,
        injected_test_files: task.evaluator_test_files,
        permitted_paths: task.source_files,
        base_exit: task.base_exit,
        corrected_exit: task.corrected_exit
      },
      null,
      2
    )}\n`
  );

  const payloads = {
    T1: { context: { regions: m.context }, localization: { symbols: m.symbols, failing_boundary: m.boundary } },
    T2: {
      context: { regions: m.context },
      localization: { symbols: m.symbols, failing_boundary: m.boundary },
      observation: { facts: [m.observation] }
    },
    T3: {
      context: { regions: m.context },
      localization: { symbols: m.symbols, failing_boundary: m.boundary },
      observation: { facts: [m.observation] },
      diagnosis: { root_cause: m.diagnosis, certainty: "confirmed" },
      behavioral_objective: m.objective
    }
  };

  for (const [arm, payload] of Object.entries(payloads)) {
    const packet = {
      schema_version: "1.0",
      protocol_version: "gate-h-heldout-v1",
      task_id: task.task_id,
      treatment_id: arm,
      combined_arm: arm === "T3",
      combined_arm_note:
        arm === "T3"
          ? "Diagnosis and behavioral objective are deliberately combined. No effect may be attributed to one rather than the other."
          : undefined,
      semantic_review_status: "author_reviewed_semantic_separation_unverified",
      payload,
      content_sha256: sha256(canonical(payload))
    };
    await writeFile(resolve(dir, "arms", `${arm}.json`), `${JSON.stringify(packet, null, 2)}\n`);
  }

  built.push({ task_id: task.task_id, issue_sha256: sha256(m.issue.trim()) });
}

process.stdout.write(`built material for ${built.length} tasks\n`);
for (const b of built) process.stdout.write(`  ${b.task_id}\n`);
