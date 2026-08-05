/**
 * Asymptotic growth probe.
 *
 * `evaluator_exit === 0` measures functional repair and nothing else. It cannot
 * see a change that is correct on every test and quadratic under adversarial
 * input. That is not a hypothetical gap: the one model output this project has
 * examined shipped exactly such a defect, passing 15/15 of its own tests
 * (`research/luna-example-framevault-ab.md`).
 *
 * This probe measures the shape of the cost curve rather than a single runtime,
 * because absolute time is a property of the machine and the growth exponent is
 * a property of the algorithm.
 *
 * Method: run the workload over a doubling series, fit a straight line to
 * log(time) against log(n), and report the slope. A linear algorithm has slope
 * ~1; a quadratic one ~2. Reported alongside r², because a slope fitted to a
 * bad line is not evidence of anything.
 *
 * Three corrections over the ad-hoc probe this generalizes
 * (`Luna-example/dos-probe.mjs`), each of which produced a misleading number
 * there:
 *
 *  1. **A noise floor.** That probe reported a "10.90x per doubling" ratio for
 *     the *linear* implementation, computed from timings of 0.6 ms and 6.2 ms.
 *     At that scale the measurement is JIT warm-up, not growth. Samples below
 *     `floorMs` are discarded rather than fitted.
 *  2. **Warm-up and repeats.** A single cold-start timing per size measures
 *     compilation. Each size is run `warmup` times unmeasured, then `repeats`
 *     times, and the median is kept — median, not mean, because a single GC
 *     pause should not move the estimate.
 *  3. **A fitted slope, not per-doubling ratios.** Consecutive ratios are noisy
 *     and invite reading a trend into three numbers. One regression over all
 *     usable points, with a stated fit quality, is harder to over-read.
 *
 * The probe reports; it does not judge. Whether a growth exponent may affect a
 * task outcome is a protocol decision (`docs/gate-h-heldout-v2-plan.md` §8), not
 * one this module makes.
 */

export interface GrowthSample {
  readonly n: number;
  readonly ms: number;
  /** False when the sample fell below the noise floor and was not fitted. */
  readonly used: boolean;
  /** True when this sample exceeded the per-sample time budget. */
  readonly over_budget?: boolean;
}

export type GrowthClass =
  | "constant_or_linear"
  | "superlinear"
  | "quadratic_or_worse"
  /**
   * Every sample finished below the noise floor at the largest size tried. The
   * implementation never got slow enough to measure, which is a **pass**.
   */
  | "below_measurement_floor"
  /**
   * A sample exceeded the time budget. The workload is too expensive to
   * characterize at these sizes, which is a **failure** — the opposite finding
   * from `below_measurement_floor`.
   */
  | "exceeded_budget"
  /** Not enough usable points, and not because everything was fast. */
  | "insufficient_points"
  /** Points exist but do not lie on a line. */
  | "unfittable";

export interface GrowthVerdict {
  /** Fitted slope of log(ms) against log(n). ~1 linear, ~2 quadratic. */
  readonly exponent: number | null;
  /** Coefficient of determination for that fit, 0..1. */
  readonly r_squared: number | null;
  readonly classification: GrowthClass;
  readonly samples: readonly GrowthSample[];
  readonly used_sample_count: number;
  readonly detail: string;
}

export interface GrowthOptions {
  /** Samples faster than this are noise-dominated and are discarded. */
  readonly floorMs?: number;
  /** Unmeasured iterations per size, to let the JIT settle. */
  readonly warmup?: number;
  /** Measured iterations per size; the median is kept. */
  readonly repeats?: number;
  /** Minimum usable points required before a slope is reported. */
  readonly minPoints?: number;
  /** Minimum r² required before a slope is trusted. */
  readonly minRSquared?: number;
  /**
   * Per-sample wall-clock budget. A workload that exceeds it stops the series
   * rather than escalating into a hang, and the verdict becomes
   * `exceeded_budget`. Without this the probe cannot enforce a "does not
   * terminate" criterion at all — it simply never returns.
   */
  readonly budgetMs?: number;
}

const DEFAULTS = {
  floorMs: 5,
  warmup: 1,
  repeats: 3,
  minPoints: 3,
  minRSquared: 0.9,
  budgetMs: 10_000
} as const;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length === 0) return 0;
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Least-squares slope and r² of y on x. */
export function fitLine(xs: readonly number[], ys: readonly number[]): { slope: number; r2: number } | null {
  const n = xs.length;
  if (n < 2 || ys.length !== n) return null;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = (xs[i] ?? 0) - meanX;
    const dy = (ys[i] ?? 0) - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  // A perfectly flat y is a perfect fit of a zero slope, not an undefined one.
  const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
  return { slope, r2 };
}

export function classifyExponent(exponent: number): GrowthClass {
  if (exponent < 1.3) return "constant_or_linear";
  if (exponent < 1.7) return "superlinear";
  return "quadratic_or_worse";
}

export function fitGrowth(samples: readonly GrowthSample[], options: GrowthOptions = {}): GrowthVerdict {
  const minPoints = options.minPoints ?? DEFAULTS.minPoints;
  const minR2 = options.minRSquared ?? DEFAULTS.minRSquared;
  const used = samples.filter((s) => s.used);

  // A budget overrun is a finding, not a missing measurement, and it is checked
  // first because such a sample is also "unusable" and would otherwise be
  // reported as though nothing had been observed.
  const overBudget = samples.filter((s) => s.over_budget === true);
  if (overBudget.length > 0) {
    const first = overBudget[0];
    return {
      exponent: null,
      r_squared: null,
      classification: "exceeded_budget",
      samples,
      used_sample_count: used.length,
      detail: `n=${first?.n} took ${first?.ms.toFixed(0)} ms, over the per-sample budget. The series was stopped rather than escalated. This is a cost finding, not a failed measurement.`
    };
  }

  if (used.length < minPoints) {
    // Two opposite situations share "not enough usable points", and collapsing
    // them is how a catastrophic implementation once received the same verdict
    // as two bounded ones. If the LARGEST size tried still finished below the
    // floor, nothing is slow and that is a pass.
    const largest = samples.reduce<GrowthSample | null>((a, b) => (a === null || b.n > a.n ? b : a), null);
    if (largest !== null && !largest.used) {
      return {
        exponent: null,
        r_squared: null,
        classification: "below_measurement_floor",
        samples,
        used_sample_count: used.length,
        detail: `every sample finished below the noise floor, including the largest (n=${largest.n} at ${largest.ms.toFixed(2)} ms). Too fast to characterize is not slow.`
      };
    }
    return {
      exponent: null,
      r_squared: null,
      classification: "insufficient_points",
      samples,
      used_sample_count: used.length,
      detail: `only ${used.length} sample(s) above the noise floor while the largest is above it; the series is too short to fit. Extend the sizes.`
    };
  }

  const fit = fitLine(used.map((s) => Math.log(s.n)), used.map((s) => Math.log(s.ms)));
  if (fit === null) {
    return {
      exponent: null,
      r_squared: null,
      classification: "insufficient_points",
      samples,
      used_sample_count: used.length,
      detail: "sizes do not vary; a slope cannot be fitted"
    };
  }
  if (fit.r2 < minR2) {
    return {
      exponent: fit.slope,
      r_squared: fit.r2,
      classification: "unfittable",
      samples,
      used_sample_count: used.length,
      detail: `fit is too poor to read a growth rate from (r²=${fit.r2.toFixed(3)} < ${minR2}); the timings are not on a line`
    };
  }

  const classification = classifyExponent(fit.slope);
  return {
    exponent: fit.slope,
    r_squared: fit.r2,
    classification,
    samples,
    used_sample_count: used.length,
    detail: `fitted exponent ${fit.slope.toFixed(2)} (r²=${fit.r2.toFixed(3)}) over ${used.length} points`
  };
}

/**
 * Times `workload` across `sizes` and fits the growth curve.
 *
 * `workload(n)` must perform work proportional to the input it is handed and
 * must not memoize across calls; the caller owns constructing a fresh input per
 * invocation, because a probe that accidentally measures a cache reports a flat
 * line and calls a quadratic algorithm linear.
 */
export async function measureGrowth(
  workload: (n: number) => void | Promise<void>,
  sizes: readonly number[],
  options: GrowthOptions = {}
): Promise<GrowthVerdict> {
  const floorMs = options.floorMs ?? DEFAULTS.floorMs;
  const warmup = options.warmup ?? DEFAULTS.warmup;
  const repeats = options.repeats ?? DEFAULTS.repeats;

  const budgetMs = options.budgetMs ?? DEFAULTS.budgetMs;
  // Ascending, so the budget check stops the series before the next size — which
  // would be worse — rather than after a hang has already happened.
  const ordered = [...sizes].sort((a, b) => a - b);

  const samples: GrowthSample[] = [];
  for (const n of ordered) {
    // One timed run first. If it already blows the budget, do not spend the
    // warm-up and repeat runs on it, and do not escalate to a larger size.
    const probeStart = process.hrtime.bigint();
    await workload(n);
    const first = Number(process.hrtime.bigint() - probeStart) / 1e6;
    if (first > budgetMs) {
      samples.push({ n, ms: first, used: false, over_budget: true });
      break;
    }

    for (let i = 0; i < warmup; i += 1) await workload(n);
    const timings: number[] = [];
    for (let i = 0; i < repeats; i += 1) {
      const start = process.hrtime.bigint();
      await workload(n);
      timings.push(Number(process.hrtime.bigint() - start) / 1e6);
    }
    const ms = median(timings);
    samples.push({ n, ms, used: ms >= floorMs });
    if (ms > budgetMs) break;
  }
  return fitGrowth(samples, options);
}

export function formatGrowth(verdict: GrowthVerdict): string {
  const rows = verdict.samples
    .map((s) =>
      `  n=${String(s.n).padStart(8)}  ${s.ms.toFixed(2).padStart(10)} ms` +
      (s.over_budget === true ? "   (OVER BUDGET — series stopped)" : s.used ? "" : "   (below floor, not fitted)")
    )
    .join("\n");
  return `${rows}\n  → ${verdict.classification}: ${verdict.detail}`;
}
