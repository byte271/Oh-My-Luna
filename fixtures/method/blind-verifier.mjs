import { readFile } from "node:fs/promises";

const workspace = process.argv[2];
if (!workspace || process.argv.length !== 3) process.exit(71);
if (Object.keys(process.env).some((key) => key.startsWith("OML_TREATMENT"))) process.exit(72);
if (Object.values(process.env).some((value) => typeof value === "string" && /L[1-5]_(?:context|localization|observation|diagnosis|plan)/u.test(value))) process.exit(73);
const result = await readFile(new URL("result.txt", `file://${workspace}/`), "utf8");
process.exit(result === "luna\n" ? 0 : 74);
