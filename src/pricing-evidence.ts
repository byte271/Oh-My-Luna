import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { OmlError } from "./errors.js";
import { validatePricingEvidence } from "./schema.js";
import type { PricingEvidence } from "./types.js";

export const PRICING_PARSER_ID = "openai-markdown-bounded-excerpt";
export const PRICING_PARSER_VERSION = "1.0.0";

export async function loadAndVerifyPricingEvidence(path: string, repositoryRoot = "."): Promise<PricingEvidence> {
  const record = await validatePricingEvidence(JSON.parse(await readFile(resolve(path), "utf8")) as unknown);
  const root = await realpath(resolve(repositoryRoot));
  for (const source of record.sources) {
    const evidencePath = await confinedRealpath(root, source.evidence_path);
    const actual = sha256(await readFile(evidencePath));
    if (actual !== source.evidence_sha256) {
      throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", `Captured pricing evidence hash mismatch: ${source.evidence_path}`);
    }
  }
  const parserPath = await confinedRealpath(root, record.parser.source_path);
  if (sha256(await readFile(parserPath)) !== record.parser.source_sha256) {
    throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", "Pricing parser source hash mismatch");
  }
  if (record.parser.id !== PRICING_PARSER_ID || record.parser.version !== PRICING_PARSER_VERSION) {
    throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", "Pricing parser identity is unsupported");
  }

  const tableSource = record.sources.find((source) => source.role === "pricing_table");
  if (!tableSource) throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", "Pricing table evidence is missing");
  const table = await readFile(await confinedRealpath(root, tableSource.evidence_path), "utf8");
  for (const model of ["gpt-5.6-luna", "gpt-5.6-sol"] as const) {
    const parsed = parseModelRow(table, model);
    if (JSON.stringify(parsed) !== JSON.stringify(record.extracted[model])) {
      throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", `Extracted prices do not match captured source for ${model}`);
    }
  }
  const ruleSources = await Promise.all(record.sources.filter((source) => source.role === "model_rule")
    .map(async (source) => readFile(await confinedRealpath(root, source.evidence_path), "utf8")));
  if (ruleSources.length < 2 || ruleSources.some((text) => !text.includes(">272K input tokens") || !text.includes("2x input and 1.5x output") || !text.includes("1.25x the uncached input token rate"))) {
    throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", "Captured model-rule evidence does not support recorded long-context/cache-write rules");
  }
  if (record.rules.long_context_threshold_input_tokens !== 272_000 || record.rules.cache_write_multiplier !== 1.25) {
    throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", "Recorded pricing rules do not match captured source");
  }
  const requiredToolRows = [
    { name: "web_search_all_models", amount_usd: 0.01, unit: "per_call" },
    { name: "file_search_tool_call", amount_usd: 0.0025, unit: "per_call" }
  ];
  if (!table.includes("$10.00 / 1k calls") || !table.includes("$2.50 / 1k calls")) {
    throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", "Captured source does not contain the recorded fixed tool-call rates");
  }
  for (const expected of requiredToolRows) {
    if (!record.tool_charges.some((charge) => charge.name === expected.name && charge.amount_usd === expected.amount_usd && charge.unit === expected.unit)) {
      throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", `Missing or inconsistent tool charge: ${expected.name}`);
    }
  }
  verifyDerivedRatios(record);
  return record;
}

export function parseModelRow(markdown: string, model: "gpt-5.6-luna" | "gpt-5.6-sol"): PricingEvidence["extracted"][string] {
  const line = markdown.split(/\r?\n/u).find((candidate) => candidate.startsWith(`| ${model} |`));
  if (!line) throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", `Missing pricing row for ${model}`);
  const values = [...line.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/gu)].map((match) => Number(match[1]));
  if (values.length !== 8) throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", `Unexpected pricing column count for ${model}`);
  return {
    short_context: { input: values[0]!, cached_input: values[1]!, cache_write: values[2]!, output: values[3]! },
    long_context: { input: values[4]!, cached_input: values[5]!, cache_write: values[6]!, output: values[7]! }
  };
}

function verifyDerivedRatios(record: PricingEvidence): void {
  const luna = record.extracted["gpt-5.6-luna"];
  const sol = record.extracted["gpt-5.6-sol"];
  if (!luna || !sol) throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", "Luna or Sol extracted pricing is missing");
  const expected: Record<string, number> = {
    sol_to_luna_short_input: sol.short_context.input / luna.short_context.input,
    sol_to_luna_short_cached_input: sol.short_context.cached_input / luna.short_context.cached_input,
    sol_to_luna_short_cache_write: sol.short_context.cache_write / luna.short_context.cache_write,
    sol_to_luna_short_output: sol.short_context.output / luna.short_context.output
  };
  for (const [key, value] of Object.entries(expected)) {
    if (record.derived_ratios[key] !== value) {
      throw new OmlError("OML_PRICING_EVIDENCE_HASH_MISMATCH", `Derived ratio mismatch: ${key}`);
    }
  }
}

async function confinedRealpath(root: string, relativePath: string): Promise<string> {
  const candidate = await realpath(resolve(root, relativePath));
  const rel = relative(root, candidate);
  if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new OmlError("OML_PATH_ESCAPE", `Pricing evidence path escapes repository root: ${relativePath}`);
  }
  return candidate;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
