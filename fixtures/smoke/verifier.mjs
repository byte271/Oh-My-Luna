import { readFile } from "node:fs/promises";

const expected = (await readFile("input.txt", "utf8")).trim();
const actual = await readFile("result.txt", "utf8").catch(() => "");
if (actual !== `${expected}\n`) {
  process.stderr.write(`expected ${JSON.stringify(`${expected}\n`)}, got ${JSON.stringify(actual)}\n`);
  process.exit(1);
}
process.stdout.write("smoke verification passed\n");
