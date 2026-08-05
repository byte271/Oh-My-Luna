import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceDirectory = join(root, "src");
const outputDirectory = join(root, "dist");

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

for (const name of ["index", "cli"]) {
  const sourcePath = join(sourceDirectory, `${name}.ts`);
  const outputPath = join(outputDirectory, `${name}.js`);
  const source = readFileSync(sourcePath, "utf8");
  const output = stripTypeScriptTypes(source, { mode: "transform" });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, "utf8");
}

writeFileSync(
  join(outputDirectory, "index.d.ts"),
  readFileSync(join(sourceDirectory, "index.d.ts"), "utf8"),
  "utf8",
);

try {
  chmodSync(join(outputDirectory, "cli.js"), 0o755);
} catch {
  // Windows does not expose Unix executable bits; the bin entry still works.
}

console.log("Built dist/index.js, dist/cli.js, and dist/index.d.ts");
