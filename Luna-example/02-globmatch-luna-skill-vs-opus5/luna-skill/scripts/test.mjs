import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const testsDirectory = join(root, "tests");
const tests = readdirSync(testsDirectory)
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => join(testsDirectory, name));

if (tests.length === 0) {
  throw new Error("No test files found");
}

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", ...tests],
  { cwd: root, stdio: "inherit" },
);

if (result.error !== undefined) {
  throw result.error;
}
process.exit(result.status ?? 1);
