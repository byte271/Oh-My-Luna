import {
  compile,
  GlobPatternError,
  match,
  matchAny
} from "../src/index.js";

const compiled = compile("src/**/*.ts");
const compiledResult: boolean = compiled.test("src/file.ts");
const directResult: boolean = match("src/**/*.ts", "src/file.ts");
const selectedIndex: number = matchAny(["**/*.ts", "!**/test.ts"], "src/file.ts");

let caught: unknown;
try {
  compile("trailing\\");
} catch (error) {
  caught = error;
}

if (!(caught instanceof GlobPatternError)) {
  throw new Error("expected GlobPatternError");
}

void compiledResult;
void directResult;
void selectedIndex;
