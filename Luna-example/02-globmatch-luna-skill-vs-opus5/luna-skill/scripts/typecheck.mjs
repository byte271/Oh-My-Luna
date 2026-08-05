import {
  readdirSync,
  readFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = fileURLToPath(new URL("..", import.meta.url));
const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8"));
if (tsconfig.compilerOptions?.strict !== true) {
  throw new Error("tsconfig.json must enable compilerOptions.strict");
}

const tscCommand = process.platform === "win32" ? "tsc.cmd" : "tsc";
const tsc = spawnSync(tscCommand, ["-p", "tsconfig.json", "--noEmit"], {
  cwd: root,
  stdio: "inherit",
});

if (tsc.error === undefined) {
  if (tsc.status !== 0) {
    process.exit(tsc.status ?? 1);
  }
  console.log("Type-check passed with the installed TypeScript compiler");
  process.exit(0);
}

function collectTypeScriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(path));
    } else if (entry.name.endsWith(".ts")) {
      files.push(path);
    }
  }
  return files;
}

const files = [
  ...collectTypeScriptFiles(join(root, "src")),
  ...collectTypeScriptFiles(join(root, "tests")),
];

for (const path of files) {
  const source = readFileSync(path, "utf8");
  stripTypeScriptTypes(source, { mode: "transform" });
}

console.log(
  `Type-check passed with Node's built-in TypeScript parser for ${files.length} files; ` +
    "no external compiler was installed",
);
