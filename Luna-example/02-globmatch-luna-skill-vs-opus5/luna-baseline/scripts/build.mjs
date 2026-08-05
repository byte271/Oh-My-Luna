import { chmod, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = resolve(scriptDirectory, "..");
const sourceDirectory = resolve(rootDirectory, "src");
const outputDirectory = resolve(rootDirectory, "dist");

export async function build() {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  const sourceFiles = [
    ["index.ts", "index.js"],
    ["cli.ts", "cli.js"]
  ];
  for (const [sourceName, outputName] of sourceFiles) {
    const sourcePath = resolve(sourceDirectory, sourceName);
    const outputPath = resolve(outputDirectory, outputName);
    const source = await readFile(sourcePath, "utf8");
    await writeFile(outputPath, source);
  }

  await copyFile(
    resolve(sourceDirectory, "index.d.ts"),
    resolve(outputDirectory, "index.d.ts")
  );
  await chmod(resolve(outputDirectory, "cli.js"), 0o755);
  process.stdout.write("Build succeeded: dist/index.js, dist/cli.js, dist/index.d.ts\n");
}

await build();
