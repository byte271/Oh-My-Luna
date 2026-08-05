import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { stripTypeScriptTypes } from "node:module";

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = dirname(rootDirectory);
const sourceDirectory = join(projectDirectory, "src");
const outputDirectory = join(projectDirectory, "dist");
const sourceFiles = ["crc32.ts", "frame.ts", "decoder.ts", "index.ts", "cli.ts"];

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });

for (const fileName of sourceFiles) {
  const source = await readFile(join(sourceDirectory, fileName), "utf8");
  const stripped = stripTypeScriptTypes(source, { mode: "transform" });
  const rewritten = stripped.replace(/(["'])(\.{1,2}\/[^"']+)\.ts\1/g, "$1$2.mjs$1");
  const outputName = fileName.replace(/\.ts$/u, ".mjs");
  await writeFile(join(outputDirectory, outputName), rewritten, "utf8");
}

console.log(`Built ${sourceFiles.length} TypeScript source files into dist/`);

