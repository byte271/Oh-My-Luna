/**
 * Verification-honesty probe.
 *
 * A verification step that cannot fail is not a verification step. The measured
 * instance this generalizes: `Luna-example/Luna-a/scripts/typecheck.mjs` runs
 * `stripTypeScriptTypes(source, { mode: "strip" })` over six files and prints
 *
 *     Parsed 6 TypeScript files; tsconfig.json enables strict type checking.
 *
 * No type checker runs. The sentence is true about `tsconfig.json` and says
 * nothing about the code. The script exits 0 on arbitrary type errors, and the
 * project's README lists it among the verification commands.
 *
 * The method is mutation testing pointed at the *verifier* rather than at the
 * tests: introduce a defect the command claims to detect, and require the
 * command to fail. A command that stays green is vacuous with respect to that
 * defect class, whatever it prints.
 *
 * The mutation kind is load-bearing and is why this is not a two-line script.
 * A *syntax* error is caught by anything that parses, including a stripper that
 * type-checks nothing — so "it failed on broken input" is not evidence of type
 * checking. Only a mutation that is syntactically valid and type-invalid
 * separates a real checker from a parser. Verdicts are therefore computed per
 * `kind`, and a command is credited only for the kinds it was actually probed
 * with.
 *
 * This is the same integrity-versus-sufficiency distinction the harness itself
 * failed three times: every control verified that inputs were the intended
 * bytes; none verified that the intended bytes were adequate. A model reproduced
 * it independently, in a different language, unprompted.
 */

import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

export type MutationKind = "type_error" | "syntax_error" | "behavior_change";

export interface Mutation {
  readonly id: string;
  readonly kind: MutationKind;
  readonly description: string;
  /** Workspace-relative file to mutate. */
  readonly path: string;
  /** Returns the mutated source, or null when it does not apply to this file. */
  readonly apply: (source: string) => string | null;
}

export interface MutationOutcome {
  readonly mutation: string;
  readonly kind: MutationKind;
  readonly applied: boolean;
  /** True when the command failed, i.e. the defect was detected. */
  readonly detected: boolean;
  readonly exit_code: number | null;
}

export type HonestyVerdict = "verifies" | "partially_verifies" | "vacuous" | "inconclusive";

export interface HonestyReport {
  readonly command: readonly string[];
  readonly baseline_passed: boolean;
  readonly outcomes: readonly MutationOutcome[];
  readonly kinds_probed: readonly MutationKind[];
  readonly kinds_detected: readonly MutationKind[];
  readonly verdict: HonestyVerdict;
  readonly detail: string;
}

export interface HonestyOptions {
  readonly workspace: string;
  readonly command: readonly string[];
  readonly mutations: readonly Mutation[];
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
}

interface RunResult {
  readonly code: number | null;
  readonly timedOut: boolean;
}

function run(argv: readonly string[], cwd: string, timeoutMs: number, env: Record<string, string>): Promise<RunResult> {
  return new Promise((res) => {
    const child = spawn(argv[0] as string, argv.slice(1), {
      cwd,
      shell: false,
      stdio: ["ignore", "ignore", "ignore"],
      env
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      res({ code: null, timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      res({ code, timedOut });
    });
  });
}

/**
 * Runs the command against the intact workspace and against one mutated copy per
 * mutation.
 *
 * Every run happens in a fresh copy, so mutations cannot accumulate and a
 * command that rewrites its own inputs cannot poison a later run.
 */
export async function probeVerificationHonesty(options: HonestyOptions): Promise<HonestyReport> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const env = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", CI: "1", ...options.env };

  const withCopy = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
    const scratch = await mkdtemp(resolve(tmpdir(), "oml-honesty-"));
    try {
      const dir = resolve(scratch, "workspace");
      await cp(options.workspace, dir, { recursive: true });
      return await fn(dir);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  };

  const baseline = await withCopy((dir) => run(options.command, dir, timeoutMs, env));
  const baselinePassed = baseline.code === 0;

  const outcomes: MutationOutcome[] = [];
  if (baselinePassed) {
    for (const mutation of options.mutations) {
      const outcome = await withCopy(async (dir) => {
        const target = resolve(dir, mutation.path);
        const source = await readFile(target, "utf8").catch(() => null);
        if (source === null) {
          return { mutation: mutation.id, kind: mutation.kind, applied: false, detected: false, exit_code: null };
        }
        const mutated = mutation.apply(source);
        if (mutated === null || mutated === source) {
          return { mutation: mutation.id, kind: mutation.kind, applied: false, detected: false, exit_code: null };
        }
        await writeFile(target, mutated);
        const result = await run(options.command, dir, timeoutMs, env);
        return {
          mutation: mutation.id,
          kind: mutation.kind,
          applied: true,
          detected: result.code !== 0,
          exit_code: result.code
        };
      });
      outcomes.push(outcome);
    }
  }

  const applied = outcomes.filter((o) => o.applied);
  const kindsProbed = [...new Set(applied.map((o) => o.kind))];
  // A kind counts as detected only if EVERY applied mutation of that kind was
  // caught. One survivor is enough to show the class escapes.
  const kindsDetected = kindsProbed.filter((kind) =>
    applied.filter((o) => o.kind === kind).every((o) => o.detected)
  );

  let verdict: HonestyVerdict;
  let detail: string;
  if (!baselinePassed) {
    verdict = "inconclusive";
    detail = `the command does not pass on the unmodified workspace (exit ${baseline.code}${baseline.timedOut ? ", timed out" : ""}), so its behaviour on a defect says nothing`;
  } else if (applied.length === 0) {
    verdict = "inconclusive";
    detail = "no mutation could be applied; the probe examined nothing";
  } else if (kindsDetected.length === 0) {
    verdict = "vacuous";
    detail = `the command passed on every one of ${applied.length} injected defect(s). It reports success unconditionally with respect to ${kindsProbed.join(", ")}.`;
  } else if (kindsDetected.length < kindsProbed.length) {
    const missed = kindsProbed.filter((k) => !kindsDetected.includes(k));
    verdict = "partially_verifies";
    detail = `detects ${kindsDetected.join(", ")}; does NOT detect ${missed.join(", ")}. Catching a syntax error is not evidence of type checking.`;
  } else {
    verdict = "verifies";
    detail = `failed on every injected defect across ${kindsProbed.join(", ")}`;
  }

  return {
    command: options.command,
    baseline_passed: baselinePassed,
    outcomes,
    kinds_probed: kindsProbed,
    kinds_detected: kindsDetected,
    verdict,
    detail
  };
}

/* ------------------------------------------------------------------ library */

/**
 * A type error that is syntactically valid.
 *
 * This is the mutation that separates a type checker from a parser. Appending a
 * declaration rather than editing existing code keeps it independent of the
 * file's contents, so the probe does not silently fail to apply.
 */
export function typeErrorMutation(path: string): Mutation {
  return {
    id: `type_error:${path}`,
    kind: "type_error",
    description: "appends a syntactically valid, type-invalid declaration",
    path,
    apply: (source) =>
      `${source}\n\n// injected by the verification-honesty probe\nconst __oml_probe_type_error: number = "not a number";\nexport const __oml_probe_use = __oml_probe_type_error;\n`
  };
}

/**
 * A syntax error. Included as a *control*, not as evidence.
 *
 * Anything that parses the file catches this, including a stripper that
 * type-checks nothing. Its role is to distinguish "the command never fails at
 * all" from "the command parses but does not type-check" — two different
 * defects that a single probe would otherwise conflate.
 */
export function syntaxErrorMutation(path: string): Mutation {
  return {
    id: `syntax_error:${path}`,
    kind: "syntax_error",
    description: "appends an unparseable fragment (control: any parser catches this)",
    path,
    apply: (source) => `${source}\n\nconst __oml_probe_syntax = (((;\n`
  };
}

export function formatHonesty(report: HonestyReport): string {
  const rows = report.outcomes
    .map((o) =>
      `  ${o.applied ? (o.detected ? "caught  " : "MISSED  ") : "skipped "}${o.kind.padEnd(16)} ${o.mutation}` +
      (o.applied ? `  (exit ${o.exit_code})` : "")
    )
    .join("\n");
  return `${report.command.join(" ")}\n${rows}\n  → ${report.verdict}: ${report.detail}`;
}
