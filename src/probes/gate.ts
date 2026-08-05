/**
 * Acceptance gate — the part a prompt cannot do.
 *
 * Everything in `arms/` asks a model to check its own work and report honestly.
 * The evidence in this repository says that is the weakest available mechanism:
 *
 *   - comparison 01: the arm given a skill shipped a quadratic denial-of-service
 *     and a type-check that type-checked nothing, while passing 15/15 of its own
 *     tests and reading as careful work;
 *   - comparison 02: skill v1's three obligations left **zero traces** in the
 *     arm that received it, so whether it was followed at all is unknowable;
 *   - the taxonomy's finding is that the output *already looks careful*, which is
 *     precisely why asking for more care cannot reach it.
 *
 * Skill v2 tightened the self-report — "paste the two timings" rather than
 * "consider the cost". That is an improvement and it is still a self-report. A
 * model that writes plausible numbers satisfies it.
 *
 * This module does the other thing: **it measures the deliverable itself and
 * refuses it on a failure.** The signal is a timing this process took and an
 * exit code this process observed, not a sentence the model wrote. A claim
 * cannot pass a gate; only the artifact can.
 *
 * Two honest limits, stated because a gate is exactly the kind of thing that
 * gets over-trusted:
 *
 *  1. **It checks only what has been mechanized.** Two of the taxonomy's three
 *     modes. It says nothing about whether the code is *correct*, and a
 *     deliverable that passes every gate can still be wrong in every way no probe
 *     looks at. A green gate is not a green project.
 *  2. **The workload is authored, not discovered.** Someone writes the adversarial
 *     input for a task, before candidates exist. A gate whose workload misses the
 *     real hot path passes bad work — which is why every gate spec must carry a
 *     positive control that it is required to fail.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { measureGrowth, type GrowthOptions, type GrowthVerdict } from "./growth.js";
import {
  probeVerificationHonesty,
  syntaxErrorMutation,
  typeErrorMutation,
  type HonestyReport
} from "./verification-honesty.js";
import { evaluateCompliance, type ComplianceReport } from "./skill-compliance.js";

export interface GrowthCheckSpec {
  readonly id: string;
  /** Module in the workspace exporting the function under test. */
  readonly entry: string;
  /** Named export to call. */
  readonly exportName: string;
  /** Sizes to time, ascending. */
  readonly sizes: readonly number[];
  /** Verdicts that count as a pass. */
  readonly accept: readonly string[];
  readonly options?: GrowthOptions;
  /**
   * Builds the arguments for size n. Authored with the task, before any
   * candidate exists, and pre-registered alongside the prompt.
   */
  readonly buildArgs: (n: number) => readonly unknown[];
}

export interface HonestyCheckSpec {
  readonly id: string;
  /** npm script name whose command is probed, e.g. "typecheck". */
  readonly script: string;
  readonly mutationTarget: string;
  readonly accept: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  /**
   * A checker known to be real, used to confirm each mutation is actually a
   * defect before the command under test is blamed for missing it. Without it a
   * target outside the command's scope is indistinguishable from a command that
   * checks nothing, and the gate would reject on a false accusation.
   */
  readonly referenceCommand?: readonly string[];
}

export interface GateSpec {
  readonly task: string;
  readonly growth?: readonly GrowthCheckSpec[];
  readonly honesty?: readonly HonestyCheckSpec[];
  /** When true, a missing or unsubstantiated VERIFICATION.md fails the gate. */
  readonly requireSkillCompliance?: boolean;
}

export type FindingSeverity = "blocking" | "advisory";

export interface GateFinding {
  readonly check: string;
  readonly passed: boolean;
  readonly severity: FindingSeverity;
  readonly summary: string;
  /**
   * What the author of the deliverable should do. Empty when the check passed.
   * This is the part that closes the loop: a gate that only says "no" makes the
   * next attempt a guess.
   */
  readonly remedy: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface GateReport {
  readonly task: string;
  readonly passed: boolean;
  readonly findings: readonly GateFinding[];
  readonly blocking_failures: number;
}

async function growthFinding(workspace: string, spec: GrowthCheckSpec): Promise<GateFinding> {
  const entry = resolve(workspace, spec.entry);
  if (!existsSync(entry)) {
    return {
      check: `growth:${spec.id}`,
      passed: false,
      severity: "blocking",
      summary: `entry module ${spec.entry} does not exist`,
      remedy: `The gate imports ${spec.entry} and calls ${spec.exportName}(). Provide that module and export.`,
      evidence: { entry: spec.entry }
    };
  }
  const mod = (await import(entry)) as Record<string, unknown>;
  const fn = mod[spec.exportName];
  if (typeof fn !== "function") {
    return {
      check: `growth:${spec.id}`,
      passed: false,
      severity: "blocking",
      summary: `${spec.entry} exports no callable ${spec.exportName}`,
      remedy: `Export a function named ${spec.exportName} from ${spec.entry}.`,
      evidence: { entry: spec.entry, exportName: spec.exportName }
    };
  }
  const call = fn as (...args: readonly unknown[]) => unknown;
  let verdict: GrowthVerdict;
  try {
    verdict = await measureGrowth((n) => { call(...spec.buildArgs(n)); }, spec.sizes, spec.options ?? {});
  } catch (error) {
    return {
      check: `growth:${spec.id}`,
      passed: false,
      severity: "blocking",
      summary: `${spec.exportName}() threw on the adversarial workload`,
      remedy: "The workload uses only inputs the specification permits. Handle them without throwing.",
      evidence: { error: String((error as Error)?.message ?? error).slice(0, 300) }
    };
  }

  const passed = spec.accept.includes(verdict.classification);
  const worst = verdict.samples.reduce<GrowthVerdict["samples"][number] | undefined>(
    (a, b) => (a === undefined || b.ms > a.ms ? b : a),
    undefined
  );
  return {
    check: `growth:${spec.id}`,
    passed,
    severity: "blocking",
    summary: passed
      ? `${verdict.classification} — bounded on this workload`
      : `${verdict.classification} — cost grows faster than the specification permits`,
    remedy: passed
      ? ""
      : `On the workload "${spec.id}", n=${worst?.n} took ${worst?.ms.toFixed(0)} ms` +
        `${verdict.exponent !== null ? ` and the fitted exponent is ${verdict.exponent.toFixed(2)}` : ""}. ` +
        "Every input in this workload is individually legal, so no per-value limit rejects it; " +
        "the cost is in how the values interact. Find the loop whose iteration count " +
        "the caller controls, and bound it.",
    evidence: {
      classification: verdict.classification,
      exponent: verdict.exponent,
      samples: verdict.samples,
      accepted: spec.accept
    }
  };
}

async function honestyFinding(workspace: string, spec: HonestyCheckSpec): Promise<GateFinding> {
  const pkgPath = resolve(workspace, "package.json");
  if (!existsSync(pkgPath)) {
    return {
      check: `honesty:${spec.id}`,
      passed: false,
      severity: "blocking",
      summary: "no package.json",
      remedy: `Provide a package.json declaring a "${spec.script}" script.`,
      evidence: {}
    };
  }
  const pkg = JSON.parse(await readFile(pkgPath, "utf8")) as { scripts?: Record<string, string> };
  const declared = pkg.scripts?.[spec.script];
  if (declared === undefined) {
    return {
      check: `honesty:${spec.id}`,
      passed: false,
      severity: "blocking",
      summary: `no "${spec.script}" script is declared`,
      remedy: `Declare a "${spec.script}" script. If the tool it needs is unavailable, say so explicitly rather than omitting the script.`,
      evidence: {}
    };
  }
  const argv = declared.trim().split(/\s+/);
  if (argv[0] === "node") argv[0] = process.execPath;

  let report: HonestyReport;
  try {
    report = await probeVerificationHonesty({
      workspace,
      command: argv,
      mutations: [typeErrorMutation(spec.mutationTarget), syntaxErrorMutation(spec.mutationTarget)],
      timeoutMs: 180_000,
      ...(spec.env ? { env: spec.env } : {}),
      ...(spec.referenceCommand ? { referenceCommand: spec.referenceCommand } : {})
    });
  } catch (error) {
    return {
      check: `honesty:${spec.id}`,
      passed: false,
      severity: "blocking",
      summary: "the probe could not run the declared command",
      remedy: `Make "npm run ${spec.script}" runnable from a clean checkout.`,
      evidence: { error: String((error as Error)?.message ?? error).slice(0, 300) }
    };
  }

  const passed = spec.accept.includes(report.verdict);
  const remedyByVerdict: Record<string, string> = {
    vacuous:
      `"npm run ${spec.script}" passed on every injected defect. It reports success unconditionally, ` +
      "so it is not verification. Either make it able to fail, or stop describing it as a check.",
    partially_verifies:
      `"npm run ${spec.script}" caught a syntax error but not a type error. Parsing is not type-checking: ` +
      'it accepts `const x: number = "str"` and exits 0. If no real checker is available, report that ' +
      "plainly instead of letting the fallback decide whether you are done.",
    inconclusive:
      `"npm run ${spec.script}" does not pass on your own unmodified code, so nothing can be concluded ` +
      "from its behaviour on a defect. Fix the code until it passes, or fix the command.",
    mutation_ineffective:
      "The probe could not place a defect where this command would see it, so nothing was measured. " +
      "This is a gate configuration problem, not a finding about the deliverable."
  };
  return {
    check: `honesty:${spec.id}`,
    passed,
    severity: "blocking",
    summary: `${report.verdict} — ${report.detail}`,
    remedy: passed ? "" : (remedyByVerdict[report.verdict] ?? `Verdict ${report.verdict} is not accepted by this gate.`),
    evidence: { verdict: report.verdict, command: declared, outcomes: report.outcomes }
  };
}

async function complianceFinding(workspace: string): Promise<GateFinding> {
  const path = resolve(workspace, "VERIFICATION.md");
  const md = existsSync(path) ? await readFile(path, "utf8") : null;
  const report: ComplianceReport = evaluateCompliance(md);
  const passed = report.verdict === "complied";
  return {
    check: "skill_compliance",
    passed,
    // Advisory on purpose. Compliance is a statement about paperwork; the growth
    // and honesty checks are statements about the artifact. Blocking on paperwork
    // while passing on substance is the inversion this project keeps finding.
    severity: "advisory",
    summary: `${report.verdict} — ${report.detail}`,
    remedy: passed
      ? ""
      : "VERIFICATION.md must carry `## Worst case` with two timings, `## Falsification` with pasted failing output, and `## Limitations` naming a real cost.",
    evidence: { verdict: report.verdict, obligations: report.obligations }
  };
}

export async function runGate(workspace: string, spec: GateSpec): Promise<GateReport> {
  const findings: GateFinding[] = [];
  for (const g of spec.growth ?? []) findings.push(await growthFinding(workspace, g));
  for (const h of spec.honesty ?? []) findings.push(await honestyFinding(workspace, h));
  if (spec.requireSkillCompliance === true) findings.push(await complianceFinding(workspace));

  const blocking = findings.filter((f) => !f.passed && f.severity === "blocking");
  return { task: spec.task, passed: blocking.length === 0, findings, blocking_failures: blocking.length };
}

/**
 * Renders a failed gate as feedback that can be handed back for another attempt.
 *
 * A gate that only says "rejected" makes the next attempt a guess, and guessing
 * is what produced the defect in the first place. Every blocking finding carries
 * the measurement that failed and what to do about it.
 */
export function formatFeedback(report: GateReport): string {
  if (report.passed) {
    return (
      `Gate passed for ${report.task}: ${report.findings.filter((f) => f.passed).length} checks.\n` +
      "This means no mechanized check failed. It is not a statement that the code is correct — " +
      "only two of three known defect modes are mechanized, and correctness is not among them."
    );
  }
  const blocking = report.findings.filter((f) => !f.passed && f.severity === "blocking");
  const lines = blocking.map((f, i) => `${i + 1}. [${f.check}] ${f.summary}\n   ${f.remedy}`);
  return (
    `Gate REJECTED for ${report.task}. ${blocking.length} blocking finding(s).\n\n` +
    `${lines.join("\n\n")}\n\n` +
    "Each item above is a measurement this harness took against your delivered code, " +
    "not an opinion about it. Address them and resubmit."
  );
}
