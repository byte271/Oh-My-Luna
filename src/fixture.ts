import { readFile, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { validateTaskFixture } from "./schema.js";
import type { LoadedFixture } from "./types.js";

export async function loadFixture(path: string): Promise<LoadedFixture> {
  const fixturePath = await realpath(resolve(path));
  const bytes = await readFile(fixturePath);
  const raw = JSON.parse(bytes.toString("utf8")) as unknown;
  const fixture = await validateTaskFixture(raw);
  return {
    fixture,
    fixtureDirectory: dirname(fixturePath),
    fixturePath,
    fixtureSha256: createHash("sha256").update(bytes).digest("hex")
  };
}
