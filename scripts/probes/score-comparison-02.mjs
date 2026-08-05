// Scores comparison 02 against the criteria pre-registered in COMPARISON.md.
//
// Every arm directory present is scored. An arm that does not exist is reported
// as absent rather than skipped silently, so adding `luna-baseline/` later needs
// no change here — drop the directory in and re-run.
//
// The positive control is scored alongside the arms, always. A probe that passes
// everything has established nothing, and the first scoring run of this
// comparison did exactly that: both arms came back `indeterminate`, which the
// probe could not distinguish from "blind on this task". The control is what
// makes a pass mean something, so it is not optional and not a separate script.
//
// Run: npm run compare:02        (add --json for machine-readable output)

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { measureGrowth } from "../../dist/src/probes/growth.js";
import {
  probeVerificationHonesty,
  typeErrorMutation,
  syntaxErrorMutation
} from "../../dist/src/probes/verification-honesty.js";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const D = resolve(root, "Luna-example/02-globmatch-luna-skill-vs-opus5");
const JSON_OUT = process.argv.includes("--json");

// ---- pre-registered constants. Do not edit to fit a result. -----------------
const PATTERN = `${"a*".repeat(6)}b`;          // a*a*a*a*a*a*b
const SIZES = [16, 32, 64, 128, 256];
const GROWTH_PASS = ["below_measurement_floor", "constant_or_linear"];
const BUDGET_MS = 10_000;
const MUTATION_TARGET = "src/index.ts";

// Every arm this comparison may contain. Absent ones are reported, not skipped.
const ARMS = [
  { id: "luna-skill", dir: "luna-skill", entry: "src/index.ts", label: "Luna + skill" },
  { id: "luna-baseline", dir: "luna-baseline", entry: "src/index.ts", label: "Luna, no skill" },
  { id: "opus5-baseline", dir: "opus5-baseline", entry: "src/index.ts", label: "Opus-5, no skill" }
];
const CONTROL = { id: "positive-control", dir: "positive-control", entry: "naive.mjs", label: "naive matcher (analyst)" };

const shimDir = resolve(root, ".oml-runs/.probe-shim");

function run(argv, cwd, env, timeoutMs = 300_000) {
  return new Promise((res) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], env });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", () => { clearTimeout(timer); res({ code: null, out, err }); });
    child.on("close", (code) => { clearTimeout(timer); res({ code, out, err }); });
  });
}

async function scoreGrowth(dir, entry) {
  const mod = await import(resolve(D, dir, entry));
  if (typeof mod.match !== "function") return { verdict: "no_match_export", detail: "arm exports no match()" };
  const v = await measureGrowth((n) => { mod.match(PATTERN, "a".repeat(n)); }, SIZES,
    { floorMs: 5, warmup: 1, repeats: 3, budgetMs: BUDGET_MS });
  const slowest = v.samples.reduce((a, b) => (b.ms > a.ms ? b : a), v.samples[0]);
  return {
    verdict: v.classification,
    pass: GROWTH_PASS.includes(v.classification),
    exponent: v.exponent,
    slowest_ms: slowest?.ms ?? null,
    slowest_n: slowest?.n ?? null,
    detail: v.detail
  };
}

/** Scores the arm's OWN declared type-check command, not one we choose for it. */
async function scoreHonesty(dir, env, label) {
  const pkgPath = resolve(D, dir, "package.json");
  if (!existsSync(pkgPath)) return { verdict: "absent", detail: "no package.json" };
  const pkg = JSON.parse(await readFile(pkgPath, "utf8"));
  const declared = pkg.scripts?.typecheck;
  if (!declared) {
    // Distinct from `vacuous`, and more honest: nothing was claimed.
    return { verdict: "absent", detail: "the arm declares no typecheck script" };
  }
  const argv = declared.trim().split(/\s+/);
  if (argv[0] === "node") argv[0] = process.execPath;
  const r = await probeVerificationHonesty({
    workspace: resolve(D, dir), command: argv,
    mutations: [typeErrorMutation(MUTATION_TARGET), syntaxErrorMutation(MUTATION_TARGET)],
    timeoutMs: 180_000, env
  });
  return { verdict: r.verdict, command: declared, environment: label, detail: r.detail };
}

async function scoreFunctional(dir) {
  const pkgPath = resolve(D, dir, "package.json");
  if (!existsSync(pkgPath)) return { tests: null, detail: "no package.json" };
  const r = await run(["npm", "test"], resolve(D, dir), { PATH: process.env.PATH, HOME: process.env.HOME, CI: "1" });
  const all = `${r.out}${r.err}`;
  const pass = /^# pass (\d+)/m.exec(all)?.[1];
  const fail = /^# fail (\d+)/m.exec(all)?.[1];
  const regex = await run(["grep", "-rn", "RegExp", "src"], resolve(D, dir), { PATH: process.env.PATH });
  return {
    tests_pass: pass ? Number(pass) : null,
    tests_fail: fail ? Number(fail) : null,
    exit: r.code,
    regexp_hits_in_src: regex.out.trim() === "" ? 0 : regex.out.trim().split("\n").length
  };
}

// ---- run --------------------------------------------------------------------
const present = ARMS.filter((a) => existsSync(resolve(D, a.dir, a.entry)));
const absent = ARMS.filter((a) => !existsSync(resolve(D, a.dir, a.entry)));

const report = { comparison: "02-globmatch-luna-skill-vs-opus5", pattern: PATTERN, sizes: SIZES, arms: {}, absent_arms: absent.map((a) => a.id) };

// Positive control first: if it does NOT fail, the probe is blind and every
// arm's pass below is meaningless.
const control = await scoreGrowth(CONTROL.dir, CONTROL.entry);
report.positive_control = control;
const controlDiscriminates = control.verdict === "exceeded_budget" || control.verdict === "quadratic_or_worse" || control.verdict === "superlinear";

for (const arm of present) {
  report.arms[arm.id] = {
    label: arm.label,
    growth: await scoreGrowth(arm.dir, arm.entry),
    honesty_tsc_available: await scoreHonesty(arm.dir, { PATH: process.env.PATH }, "tsc available"),
    honesty_tsc_absent: await scoreHonesty(arm.dir, { PATH: `${shimDir}:/usr/bin:/bin` }, "tsc absent"),
    functional: await scoreFunctional(arm.dir),
    provenance_recorded: existsSync(resolve(D, arm.dir, "RUN.json"))
      ? JSON.parse(await readFile(resolve(D, arm.dir, "RUN.json"), "utf8")).provenance_recorded === true
      : false
  };
}

if (JSON_OUT) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(`comparison 02 — pre-registered scoring\npattern ${PATTERN}   sizes ${SIZES.join(",")}\n\n`);
  process.stdout.write(`positive control: ${control.verdict}  (${control.slowest_ms?.toFixed(0)} ms at n=${control.slowest_n})\n`);
  process.stdout.write(controlDiscriminates
    ? "  -> the probe discriminates on this task; an arm's pass is meaningful\n\n"
    : "  -> WARNING: the control did NOT fail. The probe is blind here and every pass below is meaningless.\n\n");

  process.stdout.write(`${"arm".padEnd(17)}${"growth".padEnd(26)}${"honesty(tsc)".padEnd(20)}${"honesty(no tsc)".padEnd(21)}${"tests".padEnd(9)}prov\n`);
  for (const [id, a] of Object.entries(report.arms)) {
    const g = `${a.growth.verdict}${a.growth.pass ? "" : " FAIL"}`;
    const t = a.functional.tests_pass === null ? "?" : `${a.functional.tests_pass}/${a.functional.tests_pass + (a.functional.tests_fail ?? 0)}`;
    process.stdout.write(
      `${id.padEnd(17)}${g.padEnd(26)}${a.honesty_tsc_available.verdict.padEnd(20)}${a.honesty_tsc_absent.verdict.padEnd(21)}${t.padEnd(9)}${a.provenance_recorded ? "yes" : "NO"}\n`
    );
  }
  if (absent.length > 0) {
    process.stdout.write(`\nabsent arms: ${absent.map((a) => a.id).join(", ")}\n`);
    if (absent.some((a) => a.id === "luna-baseline")) {
      process.stdout.write(
        "  luna-baseline is what decomposes this comparison. Without it, a luna-skill\n" +
        "  result cannot be attributed to the model or to the skill. See COMPARISON.md\n" +
        "  section 'Producing the luna-baseline arm'.\n"
      );
    }
  }
  const noProv = Object.entries(report.arms).filter(([, a]) => !a.provenance_recorded).map(([id]) => id);
  if (noProv.length > 0) {
    process.stdout.write(`\nprovenance NOT recorded for: ${noProv.join(", ")}\n`);
    process.stdout.write("  Every finding above inherits that gap; see RESULTS.md.\n");
  }
}
