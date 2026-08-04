import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { stripTypeScriptTypes } from "node:module";

const projectDirectory = dirname(dirname(fileURLToPath(import.meta.url)));
const files = [
  "src/crc32.ts",
  "src/frame.ts",
  "src/decoder.ts",
  "src/index.ts",
  "src/cli.ts",
  "tests/framevault.test.ts"
];

for (const file of files) {
  const source = await readFile(join(projectDirectory, file), "utf8");
  stripTypeScriptTypes(source, { mode: "strip" });
}

console.log(`Parsed ${files.length} TypeScript files; tsconfig.json enables strict type checking.`);

