// POSITIVE CONTROL — written by the analyst, not by any model.
//
// Comparison 02 produced no probe hits: both arms passed the growth probe with
// every sample below the noise floor. That has two readings, and the scoring
// alone cannot tell them apart:
//
//   (a) both implementations are genuinely bounded, and the probe correctly
//       reports no defect;
//   (b) the probe has no discriminating power on this task, and would have
//       passed a bad implementation too.
//
// A check that passes everything has established nothing. This file is the
// control that separates the two readings: a deliberately naive matcher with the
// textbook exponential blowup, run through the *same pre-registered workload*. If
// the probe catches it, reading (a) holds and the arms earned their pass. If the
// probe misses it, the probe is blind here and comparison 02's growth result is
// worthless.
//
// It is written to be *plausible* rather than a strawman: recursive descent, one
// branch per split point at a star, no memoization. This is what a competent
// implementer writes first if they do not think about the adversarial case — and
// it is exactly the shape the prompt's cost requirement was aimed at.

/**
 * Naive backtracking glob matcher.
 *
 * Supports the subset the pre-registered workload uses: literals, `?`, `*`.
 * `*` tries every split point and recurses, which is where the blowup lives:
 * with k stars and a non-matching path of length n, the search explores on the
 * order of C(n+k, k) paths before failing.
 */
function matchFrom(pattern, i, path, j) {
  if (i === pattern.length) return j === path.length;

  const pc = pattern[i];

  if (pc === "*") {
    // Every split point, no memo table. Correct, and exponential on failure.
    for (let k = j; k <= path.length; k += 1) {
      if (matchFrom(pattern, i + 1, path, k)) return true;
    }
    return false;
  }

  if (j >= path.length) return false;

  if (pc === "?") {
    return path[j] === "/" ? false : matchFrom(pattern, i + 1, path, j + 1);
  }

  if (pc !== path[j]) return false;
  return matchFrom(pattern, i + 1, path, j + 1);
}

export function match(pattern, path) {
  return matchFrom(pattern, 0, path, 0);
}
