import { readFile, realpath } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validateTaskFixture } from "./schema.js";
import type { LoadedFixture } from "./types.js";

export async function loadFixture(path: string): Promise<LoadedFixture> {
  const fixturePath = await realpath(resolve(path));
  const raw = JSON.parse(await readFile(fixturePath, "utf8")) as unknown;
  const fixture = await validateTaskFixture(raw);
  return { fixture, fixtureDirectory: dirname(fixturePath), fixturePath };
}
