import { spawn } from "node:child_process";

const workspace = process.argv[2];
const tsxImport = process.argv[3] ?? "tsx";
if (!workspace || ![3, 4].includes(process.argv.length)) process.exit(71);
const code = "import * as z from 'zod'; const result=z.tuple([z.string(),z.string().default('fallback')]).parse(['present']); console.log(JSON.stringify(result)); if(result.length!==2||result[1]!=='fallback') process.exit(17);";
const child = spawn(process.execPath, ["--import", tsxImport, "--conditions", "@zod/source", "--input-type=module", "-e", code], {
  cwd: workspace,
  env: { PATH: process.env.PATH },
  shell: false,
  stdio: "inherit"
});
child.once("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(72);
});
child.once("close", (code) => process.exit(code ?? 73));
