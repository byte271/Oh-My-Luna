/**
 * Skill-compliance probe.
 *
 * Answers a question that could not be answered about skill v1 at all: **did the
 * obligations fire?**
 *
 * Grepping the arm that received v1 finds no trace of any of its three
 * obligations — no worst-case analysis, no falsification, no statement of what
 * was given up. So the v1 result is uninterpretable in a specific way: a null
 * effect is indistinguishable from a skill that was never followed, or never
 * delivered.
 *
 * That is this project's recurring defect, committed by the skill itself. v1
 * asked the model to do three things and produced no way to check that any of
 * them happened — "a check that cannot fail is not a check", one level up.
 *
 * v2 fixes it by requiring a `VERIFICATION.md` with three named sections. This
 * module reads that file and reports which obligations left evidence.
 *
 * **It measures compliance, not quality.** A `## Worst case` section containing
 * two fabricated timings passes this probe and fails `growth.ts`. The two are
 * complementary and neither substitutes for the other: compliance says the skill
 * was followed, the growth and honesty probes say whether the work is sound.
 * Reporting compliance alone would be exactly the error this project keeps
 * finding — a true statement about the letter offered as evidence about the
 * purpose.
 */

export type ObligationId = "worst_case" | "falsification" | "limitations";

export interface ObligationEvidence {
  readonly obligation: ObligationId;
  readonly heading: string;
  /** The section exists and is non-empty. */
  readonly present: boolean;
  /**
   * The section contains the *kind* of content the obligation asks for — two
   * measurements, a pasted failure, a named cost. Weaker than correctness and
   * labelled as such.
   */
  readonly substantiated: boolean;
  readonly detail: string;
  readonly excerpt: string;
}

export interface ComplianceReport {
  readonly artifact_present: boolean;
  readonly obligations: readonly ObligationEvidence[];
  readonly obligations_present: number;
  readonly obligations_substantiated: number;
  readonly verdict: "complied" | "partial" | "not_complied" | "artifact_absent";
  readonly detail: string;
}

const HEADINGS: ReadonlyArray<{ id: ObligationId; heading: string }> = [
  { id: "worst_case", heading: "Worst case" },
  { id: "falsification", heading: "Falsification" },
  { id: "limitations", heading: "Limitations" }
];

/** Splits a markdown document into `## ` sections, case-insensitively keyed. */
export function splitSections(markdown: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = markdown.split("\n");
  let current: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (current !== null) sections.set(current.toLowerCase(), buffer.join("\n").trim());
  };
  for (const line of lines) {
    const heading = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (heading !== null) {
      flush();
      current = heading[1] ?? null;
      buffer = [];
    } else if (current !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

/** At least two distinct numbers with a time unit — the two timings asked for. */
function hasTwoTimings(text: string): boolean {
  const matches = [...text.matchAll(/(\d[\d_,]*\.?\d*)\s*(ms|milliseconds?|s|seconds?|µs|us)\b/gi)];
  const values = new Set(matches.map((m) => `${m[1]}${m[2]?.toLowerCase()}`));
  return values.size >= 2;
}

/** Evidence of a command that was run and failed, rather than a claim about one. */
function hasPastedFailure(text: string): boolean {
  const failureSignal = /\b(error|exit(ed)?\s*(code\s*)?[1-9]|failed|failing|FAIL)\b/i.test(text);
  const looksPasted = /```/.test(text) || /^\s{4,}\S/m.test(text) || /^\s*[$>]/m.test(text);
  return failureSignal && looksPasted;
}

/** A named cost or an explicit statement of something not verified. */
function hasNamedCost(text: string): boolean {
  return /\b(cost|slower|memory|allocat|gives? up|gave up|trade[- ]?off|not verified|did not verify|unverified|cannot|limitation)\b/i.test(text);
}

export function evaluateCompliance(verificationMarkdown: string | null): ComplianceReport {
  if (verificationMarkdown === null) {
    return {
      artifact_present: false,
      obligations: [],
      obligations_present: 0,
      obligations_substantiated: 0,
      verdict: "artifact_absent",
      detail:
        "VERIFICATION.md is absent. Whether the obligations were performed cannot be determined — which is the state skill v1 left every result in."
    };
  }

  const sections = splitSections(verificationMarkdown);
  const obligations = HEADINGS.map(({ id, heading }): ObligationEvidence => {
    const body = sections.get(heading.toLowerCase()) ?? "";
    const present = body.trim().length > 0;
    const substantiated =
      present &&
      (id === "worst_case" ? hasTwoTimings(body) : id === "falsification" ? hasPastedFailure(body) : hasNamedCost(body));
    const detail = !present
      ? `no non-empty "## ${heading}" section`
      : substantiated
        ? "section present and carries the evidence the obligation asks for"
        : id === "worst_case"
          ? "section present but contains fewer than two timings; the obligation asks for n and 2n measured"
          : id === "falsification"
            ? "section present but shows no pasted failing output; a claim that a check can fail is not the check failing"
            : "section present but names no cost or unverified property";
    return { obligation: id, heading, present, substantiated, detail, excerpt: body.slice(0, 200) };
  });

  const present = obligations.filter((o) => o.present).length;
  const substantiated = obligations.filter((o) => o.substantiated).length;
  const verdict =
    substantiated === HEADINGS.length ? "complied" : substantiated > 0 || present > 0 ? "partial" : "not_complied";

  return {
    artifact_present: true,
    obligations,
    obligations_present: present,
    obligations_substantiated: substantiated,
    verdict,
    detail: `${substantiated}/${HEADINGS.length} obligations substantiated, ${present}/${HEADINGS.length} present. Compliance is not quality: fabricated evidence passes here and fails the growth and honesty probes.`
  };
}

export function formatCompliance(report: ComplianceReport): string {
  if (!report.artifact_present) return `  ${report.verdict}: ${report.detail}`;
  const rows = report.obligations
    .map((o) => `  ${o.substantiated ? "ok      " : o.present ? "thin    " : "MISSING "}${o.heading.padEnd(16)}${o.detail}`)
    .join("\n");
  return `${rows}\n  → ${report.verdict}: ${report.detail}`;
}
