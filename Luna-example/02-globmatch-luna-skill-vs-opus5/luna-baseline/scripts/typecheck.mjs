import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const rootDirectory = resolve(scriptDirectory, "..");

const compiler = spawnSync("tsc", ["--project", "tsconfig.json", "--noEmit"], {
  cwd: rootDirectory,
  encoding: "utf8",
  shell: true
});

if (compiler.status === 0) {
  process.stdout.write("Type-check succeeded with TypeScript.\n");
  process.exit(0);
}

const compilerMissing =
  compiler.error !== undefined ||
  (compiler.stdout.length === 0 && compiler.stderr.includes("not recognized"));
if (!compilerMissing) {
  process.stderr.write(compiler.stdout);
  process.stderr.write(compiler.stderr);
  process.exit(1);
}

const config = JSON.parse(await readFile(resolve(rootDirectory, "tsconfig.json"), "utf8"));
if (config.compilerOptions?.strict !== true || config.compilerOptions?.noEmit !== true) {
  throw new Error("tsconfig.json must enable strict and noEmit");
}

const sourceFiles = [
  resolve(rootDirectory, "src/index.ts"),
  resolve(rootDirectory, "src/cli.ts"),
  resolve(rootDirectory, "tests/typecheck.ts")
];
for (const sourceFile of sourceFiles) {
  const syntax = spawnSync(process.execPath, ["--check", sourceFile], {
    cwd: rootDirectory,
    encoding: "utf8"
  });
  if (syntax.status !== 0) {
    process.stderr.write(syntax.stderr);
    process.exit(1);
  }
}

process.stdout.write(
  "Type-check succeeded with the strict tsconfig contract and Node syntax validation (TypeScript compiler not installed).\n"
);
