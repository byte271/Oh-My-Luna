import { cp, lstat, mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { OmlError } from "./errors.js";
import type { ProposedFile } from "./types.js";

export interface PreparedEnvironment {
  root: string;
  workspace: string;
  isolation: "filesystem_copy_only";
}

export class CopyEnvironmentProvider {
  async prepare(repositoryPath: string, runsRoot: string): Promise<PreparedEnvironment> {
    await mkdir(runsRoot, { recursive: true });
    const root = await mkdtemp(resolve(runsRoot, "run-"));
    const workspace = resolve(root, "workspace");
    await cp(repositoryPath, workspace, { recursive: true, dereference: false, verbatimSymlinks: true });
    return { root, workspace, isolation: "filesystem_copy_only" };
  }
}

function inside(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

async function rejectSymlinkParents(workspace: string, target: string): Promise<void> {
  let cursor = dirname(target);
  while (inside(workspace, cursor) && cursor !== workspace) {
    try {
      if ((await lstat(cursor)).isSymbolicLink()) {
        throw new OmlError("OML_SYMLINK_REJECTED", "Patch path crosses a symbolic link", { path: cursor });
      }
    } catch (error) {
      if (error instanceof OmlError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
    cursor = dirname(cursor);
  }
}

export async function applyProposedFiles(workspace: string, files: ProposedFile[]): Promise<string[]> {
  const workspaceReal = await realpath(workspace);
  const changed: string[] = [];
  for (const file of files) {
    if (file.path.includes("\0") || isAbsolute(file.path)) {
      throw new OmlError("OML_PATH_ESCAPE", "Proposed path must be relative", { path: file.path });
    }
    const target = resolve(workspaceReal, file.path);
    if (!inside(workspaceReal, target) || target === workspaceReal) {
      throw new OmlError("OML_PATH_ESCAPE", "Proposed path escapes workspace", { path: file.path });
    }
    await rejectSymlinkParents(workspaceReal, target);
    try {
      if ((await lstat(target)).isSymbolicLink()) {
        throw new OmlError("OML_SYMLINK_REJECTED", "Patch target is a symbolic link", { path: file.path });
      }
    } catch (error) {
      if (error instanceof OmlError) throw error;
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") throw error;
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content, "utf8");
    changed.push(relative(workspaceReal, target).replaceAll("\\", "/"));
  }
  return changed;
}
