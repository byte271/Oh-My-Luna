import type { Dirent } from "node:fs";

/**
 * Resolves the directory containing a `Dirent` from a recursive `readdir`.
 *
 * `Dirent.parentPath` was introduced in Node 20.12 and 21.4, replacing `path`
 * with the same meaning. `package.json` declares `engines.node: ">=20"`, so both
 * spellings are in range, and `@types/node` 24 has already dropped the older one
 * from the type — which is why the fallback needs a cast rather than a plain
 * property read.
 *
 * The fallback that must not be used is `entry.parentPath ?? root`. It type-checks,
 * it is correct for every top-level entry, and it silently collapses every nested
 * entry to `root/<basename>` on any Node in the 20.0-20.11 range. The failure is
 * not uniform:
 *
 *   - `hashWorkspaceTree` hashes wrong relative paths and throws ENOENT on nested
 *     files — or, if a same-named file happens to sit at the root, hashes that
 *     one instead and reports a tree hash for a tree that does not exist;
 *   - `assertNoCanaryPath` keeps detecting, because a canary lives inside some
 *     path segment and every segment is some entry's own `name`, but the path it
 *     reports in the violation is wrong, which is the field an operator reads to
 *     find the offending file.
 *
 * One helper so the two call sites cannot drift apart, and so the reasoning lives
 * in one place rather than being rediscovered.
 */
export function direntParent(entry: Pick<Dirent, "parentPath">, root: string): string {
  return entry.parentPath ?? (entry as { path?: string }).path ?? root;
}
