import { readFile } from "node:fs/promises";

let requestText = "";
for await (const chunk of process.stdin) requestText += chunk;
const request = JSON.parse(requestText);
const value = (await readFile(new URL("input.txt", `file://${request.workspace}/`), "utf8")).trim();
process.stdout.write(JSON.stringify({
  schema_version: "0.1",
  files: [{ path: "result.txt", content: `${value}\n` }],
  claims: ["The deterministic smoke-test transform was applied."],
  usage: { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0 },
  raw_trace: { kind: "deterministic-test-double", is_model_run: false }
}));
