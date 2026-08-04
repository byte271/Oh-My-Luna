// Mines held-out candidate defects from repositories that Oh-My-Luna has never
// used for development.
//
// Method: find a bugfix commit that ships its own regression test. Then
//   base      = fix^
//   corrected = fix
//   evaluator = the test file(s) from the fix, run against a workspace
//
// Because the test arrived with the fix, base-fail and corrected-pass hold by
// construction rather than by hopeful selection. The test is evaluator-only and
// never enters a model workspace, so the visible task cannot leak the repair.
//
// This only proposes candidates. Each still has to be validated end to end and
// can still be rejected; rejections are recorded rather than dropped.
//
// Usage: node scripts/gate-h-heldout/mine-candidates.mjs [--repo <name>]

import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const cache = resolve(root, ".gate-h-heldout-cache");

// None of these was used in Gate M (which used zod, date-fns and type-fest),
// nor for adapter, parser, prompt or leakage-detector work.
const REPOS = [
  { name: "destr", url: "https://github.com/unjs/destr", language: "typescript", runner: "vitest", testGlob: "test" },
  { name: "ufo", url: "https://github.com/unjs/ufo", language: "typescript", runner: "vitest", testGlob: "test" },
  { name: "scule", url: "https://github.com/unjs/scule", language: "typescript", runner: "vitest", testGlob: "test" },
  { name: "node-semver", url: "https://github.com/npm/node-semver", language: "javascript", runner: "tap", testGlob: "test" },
  { name: "tomlkit", url: "https://github.com/sdispater/tomlkit", language: "python", runner: "pytest", testGlob: "tests" },
  { name: "boltons", url: "https://github.com/mahmoud/boltons", language: "python", runner: "pytest", testGlob: "tests" },
  { name: "python-slugify", url: "https://github.com/un33k/python-slugify", language: "python", runner: "pytest", testGlob: "test" }
];

const FIX_PATTERN = /\b(fix|bug|incorrect|wrong|broken|regression|should not|fails? to|does not|doesn't)\b/i;
// Reject anything that looks like a release, merge, dependency bump or docs change.
const NOISE_PATTERN = /\b(release|bump|chore\(deps\)|merge branch|merge pull request|readme|changelog|typo|lint|format|ci:|docs?:)\b/i;

function git(args, cwd = root) {
  return new Promise((res) => {
    const child = spawn("git", args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", () => res({ code: -1, out, err }));
    child.on("close", (code) => res({ code, out, err }));
  });
}

const only = process.argv.includes("--repo") ? process.argv[process.argv.indexOf("--repo") + 1] : null;
const targets = only ? REPOS.filter((r) => r.name === only) : REPOS;

await mkdir(cache, { recursive: true });
const candidates = [];

for (const repo of targets) {
  const bare = resolve(cache, "repos", repo.name, ".git");
  const cloned = await git(["-C", bare, "rev-parse", "--git-dir"]);
  if (cloned.code !== 0) {
    process.stderr.write(`cloning ${repo.name}\n`);
    const result = await git(["clone", "--bare", "--filter=blob:none", repo.url, bare]);
    if (result.code !== 0) {
      process.stderr.write(`  clone failed: ${result.err.trim().slice(0, 200)}\n`);
      continue;
    }
  }

  // Recent history only: older commits are likelier to have unbuildable
  // dependency trees, which is a reproducibility problem not a task problem.
  const log = await git(["-C", bare, "log", "-n", "700", "--format=%H%x00%s", "HEAD"]);
  const commits = log.out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, subject] = line.split("\0");
      return { sha, subject };
    });

  let found = 0;
  for (const commit of commits) {
    if (found >= 6) break;
    if (!FIX_PATTERN.test(commit.subject) || NOISE_PATTERN.test(commit.subject)) continue;

    const files = await git(["-C", bare, "show", "--name-only", "--format=", commit.sha]);
    const paths = files.out.split("\n").filter(Boolean);
    if (paths.length === 0 || paths.length > 12) continue;

    const isTest = (p) => /(^|\/)(test|tests|__tests__)\//.test(p) || /\.(test|spec)\.[cm]?[jt]s$/.test(p) || /(^|\/)test_[^/]+\.py$/.test(p);
    const testFiles = paths.filter(isTest);
    const sourceFiles = paths.filter((p) => !isTest(p) && /\.([cm]?[jt]s|py)$/.test(p) && !/\.d\.ts$/.test(p));

    // Need both: a source change to be the defect, and a test to detect it.
    if (testFiles.length === 0 || sourceFiles.length === 0) continue;

    const parent = await git(["-C", bare, "rev-parse", `${commit.sha}^`]);
    if (parent.code !== 0) continue;

    const stat = await git(["-C", bare, "show", "--stat", "--format=", commit.sha]);
    const changed = /(\d+) insertions?\(\+\)/.exec(stat.out)?.[1] ?? "0";
    // Very large diffs are usually refactors rather than a single defect.
    if (Number(changed) > 200) continue;

    candidates.push({
      candidate_id: `${repo.name}-${commit.sha.slice(0, 8)}`,
      repository: repo.url,
      repository_name: repo.name,
      language: repo.language,
      runner: repo.runner,
      fix_commit: commit.sha,
      base_commit: parent.out.trim(),
      subject: commit.subject,
      source_files: sourceFiles,
      test_files: testFiles,
      insertions: Number(changed),
      status: "proposed"
    });
    found += 1;
  }
  process.stderr.write(`${repo.name}: ${found} candidate(s)\n`);
}

await writeFile(
  resolve(root, "tasks/gate-h-heldout/candidate-pool.json"),
  `${JSON.stringify(
    {
      schema_version: "1.0",
      purpose: "gate_h_held_out_candidate_pool",
      method:
        "Bugfix commits that ship their own regression test. base = fix^, corrected = fix, evaluator = the shipped test. Base-fail and corrected-pass therefore hold by construction. The test is evaluator-only and never enters a model workspace.",
      never_used_in_oh_my_luna_development: true,
      candidate_count: candidates.length,
      candidates
    },
    null,
    2
  )}\n`
);

process.stdout.write(`candidates: ${candidates.length}\n`);
for (const c of candidates) process.stdout.write(`  ${c.candidate_id}  [${c.language}]  ${c.subject.slice(0, 70)}\n`);
