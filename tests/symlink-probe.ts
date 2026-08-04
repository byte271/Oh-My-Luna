// Host capability probe for symlink CREATION.
//
// Three adversarial tests build their fixture by calling fs.symlink(). On Windows
// without SeCreateSymbolicLinkPrivilege (i.e. no Developer Mode and a non-elevated
// shell), symlink creation fails with EPERM before the code under test is ever
// reached. That is a host limitation, not a defect in the runtime.
//
// This probe lets those tests SKIP (reported distinctly by node:test as skipped,
// never as passed) with an explicit reason, instead of failing on a fixture the
// host forbids. A skip is not a green: the symlink-rejection and tree-hash
// behaviors remain unverified-by-execution on such a host and must be labelled so.
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function detectSymlinkCreation(): boolean {
  let dir: string | undefined;
  try {
    dir = mkdtempSync(join(tmpdir(), "oml-symlink-probe-"));
    writeFileSync(join(dir, "target"), "t");
    symlinkSync("target", join(dir, "link"));
    return true;
  } catch {
    return false;
  } finally {
    if (dir) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

/** True when this host can create symlinks; false when the OS forbids it. */
export const SYMLINK_CREATION_SUPPORTED = detectSymlinkCreation();

/**
 * A `skip` value for node:test's options object. `false` when symlinks can be
 * created (test runs normally); an explanatory string otherwise (test is skipped
 * and the reason is surfaced in the run output).
 */
export const SKIP_IF_NO_SYMLINK: false | string = SYMLINK_CREATION_SUPPORTED
  ? false
  : "host cannot create symlinks (Windows without SeCreateSymbolicLinkPrivilege / Developer Mode); fixture cannot be built, so this behavior is unverified-by-execution here";
