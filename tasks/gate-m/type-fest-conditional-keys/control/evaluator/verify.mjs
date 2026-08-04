import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";

const workspaceArgument = process.argv[2];
const compilerArgument = process.argv[3];
if (!workspaceArgument || !compilerArgument || process.argv.length !== 4) process.exit(71);
const workspace = resolve(workspaceArgument);
const compiler = resolve(compilerArgument);
const directory = await mkdtemp(join(dirname(workspace), ".oml-type-fest-evaluator-"));
const testFile = join(directory, "conditional-keys.ts");
const source = `import type {ConditionalKeys} from ${JSON.stringify(`${workspace.replaceAll("\\", "/")}/index.d.ts`)};\n` +
  "type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;\n" +
  "type Assert<T extends true> = T;\n" +
  "type Example = {a: string; b?: string | number; c?: string; d: Record<string, unknown>};\n" +
  "type Result = Assert<Equal<ConditionalKeys<Example, string | undefined>, 'a' | 'c'>>;\n" +
  "declare const result: Result; void result;\n";
await writeFile(testFile, source, "utf8");
const child = spawn(process.execPath, [compiler, "--noEmit", "--strict", "--skipLibCheck", "--moduleResolution", "node", "--module", "esnext", "--target", "es2022", testFile], {
  cwd: directory,
  env: { PATH: process.env.PATH },
  shell: false,
  stdio: "inherit"
});
child.once("error", async (error) => {
  process.stderr.write(`${error.message}\n`);
  await rm(directory, { recursive: true, force: true });
  process.exit(72);
});
child.once("close", async (code) => {
  await rm(directory, { recursive: true, force: true });
  process.exit(code ?? 73);
});
