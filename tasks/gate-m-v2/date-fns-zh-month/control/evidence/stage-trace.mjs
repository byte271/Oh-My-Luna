// Diagnosis evidence probe for date-fns-zh-month.
//
// The evaluator only reports the end result (`["Invalid","Invalid",1,1]` on the
// base commit). That output alone does not say *where* each case fails, and the
// V1 L4 diagnosis was wrong precisely because it assumed a single mechanism.
//
// This probe splits the locale's month handling into its two stages and reports
// each separately, so the L4 diagnosis can be checked against observation
// rather than inferred:
//
//   match stage      locale.match.month(token) -- does the token match at all?
//   selection stage  the returned value        -- which month index was chosen?
//
// A case that fails at the match stage and a case that fails at the selection
// stage are different defects. Usage:
//
//   node stage-trace.mjs <worktree>
//
// Controller-only. Never enters a model task workspace.

import { spawn } from "node:child_process";

const workspace = process.argv[2];
if (!workspace || process.argv.length !== 3) process.exit(71);

const code = `
import { zhCN } from './pkgs/core/src/locale/zh-CN/index.ts';

// Month tokens as the parser sees them, with the width each format token uses.
const cases = [
  { label: 'numeric October',  token: '10月27日', width: 'abbreviated' },
  { label: 'wide October',     token: '十月27日', width: 'wide' },
  { label: 'numeric November', token: '11月27日', width: 'abbreviated' },
  { label: 'numeric December', token: '12月27日', width: 'abbreviated' },
];

const out = cases.map(({ label, token, width }) => {
  const matched = zhCN.match.month(token, { width });
  if (!matched) {
    return { label, token, width, match_stage: 'no_match', selected_month: null };
  }
  return {
    label,
    token,
    width,
    match_stage: 'matched',
    matched_text: token.slice(0, token.length - matched.rest.length),
    selected_month: matched.value + 1,
  };
});
console.log(JSON.stringify(out, null, 2));
`;

const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", code], {
  cwd: workspace,
  env: { PATH: process.env.PATH },
  shell: false,
  stdio: "inherit",
});
child.once("error", (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(72);
});
child.once("close", (code) => process.exit(code ?? 73));
