// Provisions the external inputs that `gate-m:validate` expects.
//
// `.gate-m-cache/` and `oml-gate-m-candidates-*/` are gitignored, so a clean
// clone cannot run `gate-m:validate` until the upstream repositories and the
// pinned TypeScript compiler are materialized. `tasks/gate-m/SOURCES.md`
// documents those steps in prose; this script executes them, so the validation
// result is reproducible rather than dependent on one machine's leftover state.
//
// Nothing here trusts that a file exists: every worktree is checked against its
// pinned commit, every commit against its expected `git archive` hash, and the
// compiler tarball against both published digests. Anything that does not match
// is rebuilt or reported, never used.
//
// Network access is required here and only here. Evaluators run offline
// afterwards. This provisions trusted upstream source with host authority; it
// is a reproducibility helper, not a sandbox.
//
// Error codes:
//   OML_PROVISION_SOURCE_UNAVAILABLE  upstream could not be retrieved
//   OML_PROVISION_ARCHIVE_MISMATCH    commit content differs from expectation
//   OML_PROVISION_COMPILER_MISMATCH   compiler tarball digest differs

import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = resolve(new URL("../..", import.meta.url).pathname);
const cache = resolve(root, ".gate-m-cache");
const candidates = resolve(root, "oml-gate-m-candidates-0cfH2Y");

const repos = {
  zod: "https://github.com/colinhacks/zod",
  "date-fns": "https://github.com/date-fns/date-fns",
  "type-fest": "https://github.com/sindresorhus/type-fest",
};

// Worktree name -> repo, commit, expected `git archive` sha256.
// Base hashes are the committed values in each task manifest.json; corrected
// hashes are the values reproduced by scripts/gate-m/validate-real-tasks.mjs.
const worktrees = {
  "zod-tuple-base": {
    repo: "zod",
    commit: "ec979ad783a9e9c992d3c9bd4e5f3b56110b1ef8",
    archive: "db2a94e7fde8db8d3ea244df4dd94b3b8172d801e062384b5efc9dfbd7ffc72c",
  },
  "zod-tuple-fixed": {
    repo: "zod",
    commit: "b6066b3e4730fc8b966d13974b4abae8dce25df4",
    archive: "9223198b45c0e7b62bb24830b9c370493ffcc24968806fd360c96a3f47b7f142",
  },
  "zod-catch-base": {
    repo: "zod",
    commit: "b8dffe9e62f17e6571e6249d05cc5102b54d94e4",
    archive: "c5b0f46d101a54485e440382bb67852391771e98f941a50c6810b5dabc49c24c",
  },
  "zod-catch-fixed": {
    repo: "zod",
    commit: "1cab69383fcdeae2a366d5e2a2fc4d8fc765d168",
    archive: "3807313c68bad89e1d63a00a6fb5945a645a1b173262c9654b2828da21f71ddb",
  },
  "date-fns-base": {
    repo: "date-fns",
    commit: "39d1e14200cead9e4be5df88695b5e82082875ed",
    archive: "2521606bb70dd781849cc7a5f120ba09a89a3f9b0ab98ddfa984427ddd3ff00a",
  },
  "date-fns-fixed": {
    repo: "date-fns",
    commit: "b9c5865edb7610c59e6b3694ed1e1691f4807688",
    archive: "1fb62cb08a98addb864d5e37c63e7469f7f5b05fd66d80e842dc35835a1e2dbd",
  },
  "type-fest-base": {
    repo: "type-fest",
    commit: "b6d8dd60726a8d7df5a5eea3b3c9d830804d2570",
    archive: "7fdeb70c2eab145029340e3c64288ad349bff000d2d3ad6ed1d2903bc8e5097c",
  },
  "type-fest-fixed": {
    repo: "type-fest",
    commit: "0fb2d62f7d222d3effb0ad89d5b340e36285bcc4",
    archive: "747ea7d24e27ae6e97b46c3b4f3837e57b80facbce31a62ace479cd9ba00384d",
  },
};

// Only the Zod worktrees need dependencies; date-fns uses Node type stripping
// and type-fest is checked by the pinned compiler directly.
const needsInstall = ["zod-tuple-base", "zod-tuple-fixed", "zod-catch-base", "zod-catch-fixed"];

// Identity from tasks/gate-m/SOURCES.md. Verified before extraction.
const TYPESCRIPT_VERSION = "5.4.2";
const TYPESCRIPT_SHASUM = "0ae9cebcfae970718474fe0da2c090cad6577372";
const TYPESCRIPT_INTEGRITY =
  "+2/g0Fds1ERlP6JsakQQDXjZdZMM+rqpamFZJEKh4kwTIn3iDkgKtby0CeNd5ATNZ4Ry1ax15TMx0W2V+miizQ==";

const offline = process.argv.includes("--offline");
const log = (line) => process.stderr.write(`${line}\n`);

class ProvisionError extends Error {
  constructor(code, message) {
    super(`${code}: ${message}`);
    this.code = code;
  }
}

function run(argv, cwd, { env, capture = "utf8" } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    const out = [];
    let stderr = "";
    child.stdout.on("data", (c) => out.push(c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", (error) => reject(new ProvisionError("OML_PROVISION_SOURCE_UNAVAILABLE", `${argv[0]} could not be executed: ${error.message}`)));
    child.on("close", (code) => {
      if (code !== 0) {
        const error = new Error(`${argv.join(" ")} exited ${code}\n${stderr.trim().slice(-2000)}`);
        error.exitCode = code;
        error.stderr = stderr;
        reject(error);
        return;
      }
      const buffer = Buffer.concat(out);
      resolvePromise(capture === "buffer" ? buffer : buffer.toString("utf8"));
    });
  });
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

async function archiveHash(bare, commit) {
  // Must match validate-real-tasks.mjs: a plain `git archive` of the commit.
  const buffer = await run(["git", "-C", bare, "archive", commit], root, { capture: "buffer" });
  return sha256(buffer);
}

async function provisionRepos() {
  for (const [name, url] of Object.entries(repos)) {
    const bare = resolve(cache, "repos", name, ".git");
    if (await exists(bare)) {
      log(`repo ${name}: present`);
      continue;
    }
    if (offline) {
      throw new ProvisionError("OML_PROVISION_SOURCE_UNAVAILABLE", `repo ${name} is absent and --offline was requested`);
    }
    log(`repo ${name}: cloning`);
    try {
      await run(["git", "clone", "--bare", "--filter=blob:none", url, bare], root);
    } catch (error) {
      await rm(resolve(cache, "repos", name), { recursive: true, force: true });
      throw new ProvisionError(
        "OML_PROVISION_SOURCE_UNAVAILABLE",
        `could not clone ${url}. Provisioning needs network access.\n${String(error.message).slice(0, 600)}`
      );
    }
  }
}

async function ensureCommit(bare, commit, name) {
  // A blobless clone may not carry an old commit if the branch moved on.
  try {
    await run(["git", "-C", bare, "cat-file", "-e", `${commit}^{commit}`], root);
    return;
  } catch {
    /* fall through to fetch */
  }
  if (offline) {
    throw new ProvisionError("OML_PROVISION_SOURCE_UNAVAILABLE", `${name}: commit ${commit} missing from cache and --offline was requested`);
  }
  log(`repo ${name}: fetching missing commit ${commit.slice(0, 8)}`);
  try {
    await run(["git", "-C", bare, "fetch", "origin", commit], root);
  } catch (error) {
    throw new ProvisionError(
      "OML_PROVISION_SOURCE_UNAVAILABLE",
      `${name}: upstream no longer serves commit ${commit}.\n${String(error.message).slice(0, 400)}`
    );
  }
}

async function provisionWorktrees() {
  for (const [name, spec] of Object.entries(worktrees)) {
    const bare = resolve(cache, "repos", spec.repo, ".git");
    const path = resolve(cache, "worktrees", name);
    await ensureCommit(bare, spec.commit, spec.repo);

    // Verify content identity before trusting any cached worktree. A worktree
    // at the right commit whose files were edited is exactly the kind of stale
    // state that made the previous validation unreproducible.
    const actualArchive = await archiveHash(bare, spec.commit);
    if (actualArchive !== spec.archive) {
      throw new ProvisionError(
        "OML_PROVISION_ARCHIVE_MISMATCH",
        `${name}: commit ${spec.commit} does not have the expected content\n` +
          `  expected archive sha256 ${spec.archive}\n` +
          `  actual   archive sha256 ${actualArchive}\n` +
          `  Refusing to provision. Do not update the expected hash to make this pass.`
      );
    }

    if (await exists(resolve(path, ".git"))) {
      let head = "";
      try {
        head = (await run(["git", "-C", path, "rev-parse", "HEAD"], root)).trim();
      } catch {
        head = "";
      }
      const dirty = head === spec.commit ? (await run(["git", "-C", path, "status", "--porcelain"], root)).trim() : "x";
      if (head === spec.commit && dirty === "") {
        log(`worktree ${name}: present at ${spec.commit.slice(0, 8)} (archive verified)`);
        continue;
      }
      log(`worktree ${name}: ${head === spec.commit ? "modified" : `stale (${head.slice(0, 8) || "unreadable"})`}, recreating`);
      await run(["git", "-C", bare, "worktree", "remove", "--force", path], root).catch(() => {});
      await rm(path, { recursive: true, force: true });
      await run(["git", "-C", bare, "worktree", "prune"], root).catch(() => {});
    }

    log(`worktree ${name}: creating at ${spec.commit.slice(0, 8)}`);
    await run(["git", "-C", bare, "worktree", "prune"], root).catch(() => {});
    await run(["git", "-C", bare, "worktree", "add", "--detach", path, spec.commit], root);
  }
}

async function provisionDependencies() {
  for (const name of needsInstall) {
    const path = resolve(cache, "worktrees", name);
    if (await exists(resolve(path, "node_modules"))) {
      log(`deps ${name}: present`);
      continue;
    }
    if (offline) {
      throw new ProvisionError("OML_PROVISION_SOURCE_UNAVAILABLE", `deps ${name} are absent and --offline was requested`);
    }
    log(`deps ${name}: installing`);
    try {
      await run(["corepack", "pnpm", "install", "--ignore-scripts", "--frozen-lockfile"], path, {
        env: { COREPACK_ENABLE_DOWNLOAD_PROMPT: "0" },
      });
    } catch (error) {
      throw new ProvisionError(
        "OML_PROVISION_SOURCE_UNAVAILABLE",
        `could not install dependencies for ${name}. Provisioning needs network access.\n${String(error.message).slice(0, 600)}`
      );
    }
  }
}

async function provisionTypeScript() {
  const dest = resolve(candidates, `typescript-${TYPESCRIPT_VERSION}`);
  const lib = resolve(dest, "package", "lib", "tsc.js");
  const tarball = resolve(candidates, `typescript-${TYPESCRIPT_VERSION}.tgz`);

  // Re-verify the cached tarball on every run so a corrupted or swapped cache
  // is caught rather than reused.
  if (await exists(tarball)) {
    const bytes = await readFile(tarball);
    const shasum = createHash("sha1").update(bytes).digest("hex");
    if (shasum !== TYPESCRIPT_SHASUM) {
      log(`typescript ${TYPESCRIPT_VERSION}: cached tarball corrupt, discarding`);
      await rm(tarball, { force: true });
      await rm(dest, { recursive: true, force: true });
    }
  }

  if ((await exists(lib)) && (await exists(tarball))) {
    log(`typescript ${TYPESCRIPT_VERSION}: present (digest verified)`);
    return lib;
  }

  await rm(dest, { recursive: true, force: true });
  await mkdir(candidates, { recursive: true });

  if (!(await exists(tarball))) {
    if (offline) {
      throw new ProvisionError("OML_PROVISION_SOURCE_UNAVAILABLE", `typescript ${TYPESCRIPT_VERSION} is absent and --offline was requested`);
    }
    log(`typescript ${TYPESCRIPT_VERSION}: fetching`);
    try {
      await run(["npm", "pack", `typescript@${TYPESCRIPT_VERSION}`, "--silent"], candidates);
    } catch (error) {
      throw new ProvisionError(
        "OML_PROVISION_SOURCE_UNAVAILABLE",
        `could not fetch typescript@${TYPESCRIPT_VERSION}. Provisioning needs network access.\n${String(error.message).slice(0, 600)}`
      );
    }
  }

  const bytes = await readFile(tarball);
  const shasum = createHash("sha1").update(bytes).digest("hex");
  const integrity = createHash("sha512").update(bytes).digest("base64");
  if (shasum !== TYPESCRIPT_SHASUM || integrity !== TYPESCRIPT_INTEGRITY) {
    await rm(tarball, { force: true });
    throw new ProvisionError(
      "OML_PROVISION_COMPILER_MISMATCH",
      `typescript ${TYPESCRIPT_VERSION} identity does not match SOURCES.md\n` +
        `  shasum    expected ${TYPESCRIPT_SHASUM}\n` +
        `  shasum    actual   ${shasum}\n` +
        `  integrity expected sha512-${TYPESCRIPT_INTEGRITY}\n` +
        `  integrity actual   sha512-${integrity}\n` +
        `  Refusing to extract. Do not update the expected digest to make this pass.`
    );
  }

  await mkdir(dest, { recursive: true });
  await run(["tar", "-xzf", tarball, "-C", dest, "--no-same-owner"], candidates);
  return lib;
}

try {
  await mkdir(cache, { recursive: true });
  await provisionRepos();
  await provisionWorktrees();
  await provisionDependencies();
  const compiler = await provisionTypeScript();

  // Record what was provisioned so validate can run offline and a reviewer can
  // see which identities this machine actually holds.
  const receipt = {
    schema_version: "0.1",
    provisioned_at: new Date().toISOString(),
    node_version: process.version,
    compiler: { version: TYPESCRIPT_VERSION, path: compiler, shasum: TYPESCRIPT_SHASUM },
    worktrees: Object.fromEntries(
      Object.entries(worktrees).map(([name, spec]) => [name, { commit: spec.commit, archive_sha256: spec.archive }])
    ),
  };
  await writeFile(resolve(cache, "provision-receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);

  log("\nprovisioned. all pinned commits verified against expected archive hashes.");
  process.stdout.write(`${compiler}\n`);
} catch (error) {
  if (error instanceof ProvisionError) {
    log(`\n${error.message}`);
    process.exit(error.code === "OML_PROVISION_SOURCE_UNAVAILABLE" ? 3 : 4);
  }
  throw error;
}
