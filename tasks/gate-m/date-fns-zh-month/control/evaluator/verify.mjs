import { spawn } from "node:child_process";

const workspace = process.argv[2];
if (!workspace || process.argv.length !== 3) process.exit(71);
const code = "import {parse} from './pkgs/core/src/parse/index.ts'; import {zhCN} from './pkgs/core/src/locale/zh-CN/index.ts'; const cases=[['2022年10月27日','yyyy年MMMdd日'],['2022年十月27日','yyyy年MMMMdd日'],['2022年11月27日','yyyy年MMMdd日'],['2022年12月27日','yyyy年MMMdd日']]; const got=cases.map(([s,f])=>{const d=parse(s,f,new Date(2000,0,1),{locale:zhCN}); return Number.isNaN(d.getTime())?'Invalid':d.getMonth()+1;}); console.log(JSON.stringify(got)); if(JSON.stringify(got)!=='[10,10,11,12]') process.exit(17);";
const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", code], {
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
