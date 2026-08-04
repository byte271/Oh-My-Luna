import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { sha256 } from "./canonical.js";
import type { ArtifactRecord } from "./types.js";

export class ArtifactStore {
  readonly #root: string;

  constructor(root: string) {
    this.#root = root;
  }

  async put(kind: string, data: string | Buffer): Promise<ArtifactRecord> {
    const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const digest = sha256(bytes);
    const directory = join(this.#root, "sha256", digest.slice(0, 2));
    const path = join(directory, digest);
    await mkdir(directory, { recursive: true });
    try {
      await readFile(path);
    } catch {
      await writeFile(path, bytes, { flag: "wx" });
    }
    return {
      kind,
      sha256: digest,
      bytes: bytes.length,
      relative_path: relative(this.#root, path).replaceAll("\\", "/")
    };
  }
}
