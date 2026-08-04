// Provisions the held-out corpus on a clean machine.
//
// The corpus worktrees live in `.gate-h-heldout-cache/`, which is gitignored,
// so a fresh clone cannot run Stage A until they are materialized. This script
// does that deterministically and verifies content identity rather than
// trusting that files exist.
//
// Every pinned commit is checked against its expected `git archive` sha256
// before use. A mismatch aborts; it is never resolved by updating the expected
// hash.
//
// Network is required here and only here. Evaluation runs offline afterwards.
//
// Error codes:
//   3  a source could not be retrieved
//   4  a commit's content does not match its expected hash
//   5  a required local tool is missing
//
// Usage: node scripts/gate-h-heldout/provision.mjs [--offline]

import { createHash } from "node:crypto";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const cache = resolve(root, ".gate-h-heldout-cache");
const offline = process.argv.includes("--offline");

const REPOS = {
  scule: "https://github.com/unjs/scule",
  ufo: "https://github.com/unjs/ufo",
  tomlkit: "https://github.com/sdispater/tomlkit",
  boltons: "https://github.com/mahmoud/boltons"
};

// Expected `git archive` sha256 for every commit the corpus depends on.
// Base commits are what Stage A runs against; corrected commits are what the
// evaluator pulls its regression test from.
const COMMITS = [
  { repo: "scule", label: "base", sha: "d2c281f10e12b8e33a2ed6ef3630eeb54de7de7c", archive: "4260ee304e5ec9bcd4cf2d1c74508c6dd929f2765ce2ab13668bf74cd1c3ffea", worktree: true, node: true },
  { repo: "scule", label: "fixed", sha: "57cfd1528a03720392604a2e582782fc481657dd", archive: "04b721963d7d6a92140f740b9dba252e32137957cc7a44f74b49f6b6fc309f46", worktree: false, node: false },
  { repo: "scule", label: "base", sha: "8a7a4b3d26f4cac3cbae3ab08a3338d30899873b", archive: "dbfa2228b107dba1fbb1bb36cf66b843f74553be23675445ac805e3f3a5a7138", worktree: true, node: true },
  { repo: "scule", label: "fixed", sha: "3815767fb33a87bca13370d9c1a86cc211ee3b11", archive: "a52ca2ea4b9e8d0d27b6b164ece660740add4c650ff31133e4a454b918fe1e37", worktree: false, node: false },
  { repo: "ufo", label: "base", sha: "a7b94e69ff6159de8ddfd4940c90db4708c0d67e", archive: "60670cb3dd4e33f38c9ce399c0c66b8916b9f46d157cdebe3f3bfc5a18368f40", worktree: true, node: true },
  { repo: "ufo", label: "fixed", sha: "5cd9e676711af3f4e4b5398ddf6ca8d52c1c7e1f", archive: "edf2e2ef41380aebe619d2716fa76decb9c6ea6e0a9e7c9c79b30fcfa69a12ff", worktree: false, node: false },
  { repo: "tomlkit", label: "base", sha: "d3c76f0bbe90af4b12a3b83bd8e59bc9061dfe85", archive: "098171fdfda4c753dcce47ac86033d0eba06d189487cd36d2fb8657796f19ea3", worktree: true, node: false },
  { repo: "tomlkit", label: "fixed", sha: "43668ddebc3f082bf385d328aceed18d26976897", archive: "7a702242d9736ae77d50e3664c95c195da15688a9559fb33df6758f45e94cecb", worktree: false, node: false },
  { repo: "boltons", label: "base", sha: "57cb026b7f47cd2765a0d5acdc83849ed5f1f6a3", archive: "77db08358b08e4dcea4bd88d0f3a0e7173af8d1768df2763b1aa3456948518a7", worktree: true, node: false },
  { repo: "boltons", label: "fixed", sha: "ead236e278ca0466bf468de746b5960fb12d7e5b", archive: "826f230a6e4bbbe85a90f54148014396dfb17d3a53b5e952aa853a1e99940de9", worktree: false, node: false }
];

const log = (line) => process.stderr.write(`${line}\n`);

class ProvisionError extends Error {
  constructor(code, exit, message) {
    super(`${code}: ${message}`);
    this.exit = exit;
  }
}

function run(argv, cwd, { env, capture = "utf8", timeoutMs = 900_000 } = {}) {
  return new Promise((res, rej) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...env } });
    const out = [];
    let err = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", (e) => {
      clearTimeout(timer);
      rej(new ProvisionError("OML_HELDOUT_TOOL_MISSING", 5, `${argv[0]} could not be executed: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const buf = Buffer.concat(out);
      if (code !== 0) {
        const error = new Error(`${argv.join(" ")} exited ${code}\n${err.trim().slice(-800)}`);
        error.exitCode = code;
        rej(error);
        return;
      }
      res(capture === "buffer" ? buf : buf.toString("utf8"));
    });
  });
}

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

// --- preflight: required tools ---------------------------------------------
for (const [tool, argv] of [["git", ["git", "--version"]], ["python3", ["python3", "--version"]]]) {
  try {
    await run(argv, root, { timeoutMs: 30_000 });
  } catch {
    throw new ProvisionError("OML_HELDOUT_TOOL_MISSING", 5, `${tool} is required but not available`);
  }
}
try {
  await run(["python3", "-c", "import pytest"], root, { timeoutMs: 60_000 });
} catch {
  throw new ProvisionError("OML_HELDOUT_TOOL_MISSING", 5, "pytest is required for the Python tasks: pip install pytest");
}

// --- clones -----------------------------------------------------------------
for (const [name, url] of Object.entries(REPOS)) {
  const bare = resolve(cache, "repos", name, ".git");
  if (await exists(bare)) {
    log(`repo ${name}: present`);
    continue;
  }
  if (offline) throw new ProvisionError("OML_HELDOUT_SOURCE_UNAVAILABLE", 3, `repo ${name} absent and --offline requested`);
  log(`repo ${name}: cloning`);
  try {
    await run(["git", "clone", "--bare", "--filter=blob:none", url, bare], root);
  } catch (error) {
    await rm(resolve(cache, "repos", name), { recursive: true, force: true });
    throw new ProvisionError("OML_HELDOUT_SOURCE_UNAVAILABLE", 3, `could not clone ${url}\n${String(error.message).slice(0, 500)}`);
  }
}

// --- commits, verified ------------------------------------------------------
for (const spec of COMMITS) {
  const bare = resolve(cache, "repos", spec.repo, ".git");
  try {
    await run(["git", "-C", bare, "cat-file", "-e", `${spec.sha}^{commit}`], root, { timeoutMs: 60_000 });
  } catch {
    if (offline) throw new ProvisionError("OML_HELDOUT_SOURCE_UNAVAILABLE", 3, `${spec.repo}: ${spec.sha} missing and --offline requested`);
    log(`repo ${spec.repo}: fetching ${spec.sha.slice(0, 8)}`);
    try {
      await run(["git", "-C", bare, "fetch", "origin", spec.sha], root);
    } catch (error) {
      throw new ProvisionError("OML_HELDOUT_SOURCE_UNAVAILABLE", 3, `${spec.repo}: upstream no longer serves ${spec.sha}\n${String(error.message).slice(0, 300)}`);
    }
  }

  const archive = await run(["git", "-C", bare, "archive", spec.sha], root, { capture: "buffer" });
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== spec.archive) {
    throw new ProvisionError(
      "OML_HELDOUT_ARCHIVE_MISMATCH",
      4,
      `${spec.repo} ${spec.sha} content does not match the frozen corpus\n` +
        `  expected ${spec.archive}\n  actual   ${actual}\n` +
        "  Refusing to provision. Do not update the expected hash to make this pass."
    );
  }

  if (!spec.worktree) continue;

  const path = resolve(cache, "worktrees", `${spec.repo}-base-${spec.sha.slice(0, 8)}`);
  if (await exists(resolve(path, ".git"))) {
    const head = (await run(["git", "-C", path, "rev-parse", "HEAD"], root, { timeoutMs: 60_000 })).trim();
    const dirty = (await run(["git", "-C", path, "status", "--porcelain"], root, { timeoutMs: 120_000 })).trim();
    if (head === spec.sha && dirty === "") {
      log(`worktree ${spec.repo}-base-${spec.sha.slice(0, 8)}: present (archive verified)`);
    } else {
      log(`worktree ${spec.repo}-base-${spec.sha.slice(0, 8)}: ${dirty ? "modified" : "stale"}, recreating`);
      await run(["git", "-C", bare, "worktree", "remove", "--force", path], root).catch(() => {});
      await rm(path, { recursive: true, force: true });
    }
  }
  if (!(await exists(resolve(path, ".git")))) {
    log(`worktree ${spec.repo}-base-${spec.sha.slice(0, 8)}: creating`);
    await run(["git", "-C", bare, "worktree", "prune"], root).catch(() => {});
    await run(["git", "-C", bare, "worktree", "add", "--detach", path, spec.sha], root);
  }

  if (spec.node && !(await exists(resolve(path, "node_modules")))) {
    if (offline) throw new ProvisionError("OML_HELDOUT_SOURCE_UNAVAILABLE", 3, `deps for ${spec.repo} absent and --offline requested`);
    log(`deps ${spec.repo}-${spec.sha.slice(0, 8)}: installing`);
    const usePnpm = await exists(resolve(path, "pnpm-lock.yaml"));
    const argv = usePnpm
      ? ["corepack", "pnpm", "install", "--ignore-scripts", "--no-frozen-lockfile"]
      : ["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund"];
    try {
      await run(argv, path, { env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" } });
    } catch (error) {
      throw new ProvisionError("OML_HELDOUT_SOURCE_UNAVAILABLE", 3, `dependency install failed for ${spec.repo}\n${String(error.message).slice(0, 500)}`);
    }
  }
}

await writeFile(
  resolve(cache, "provision-receipt.json"),
  `${JSON.stringify(
    {
      schema_version: "1.0",
      corpus_id: "gate-h-heldout-2026-08-02",
      provisioned_at: new Date().toISOString(),
      node_version: process.version,
      commits: COMMITS.map((c) => ({ repo: c.repo, sha: c.sha, archive_sha256: c.archive }))
    },
    null,
    2
  )}\n`
);

log("\nprovisioned. all corpus commits verified against their frozen archive hashes.");
process.stdout.write("ready: node scripts/gate-h-heldout/run-stage-a.mjs --dry-run oracle\n");
