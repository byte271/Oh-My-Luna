import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { OmlError } from "./errors.js";
import type { ModelResponse, RunReceipt, TaskFixture } from "./types.js";

const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
const cache = new Map<string, ValidateFunction>();

async function validator(relativePath: string): Promise<ValidateFunction> {
  const existing = cache.get(relativePath);
  if (existing) return existing;
  const schemaPath = fileURLToPath(new URL(`../../schemas/${relativePath}`, import.meta.url));
  const schema = JSON.parse(await readFile(schemaPath, "utf8")) as object;
  const compiled = ajv.compile(schema);
  cache.set(relativePath, compiled);
  return compiled;
}

async function assertSchema<T>(value: unknown, relativePath: string, label: string): Promise<T> {
  const validate = await validator(relativePath);
  if (!validate(value)) {
    throw new OmlError("OML_FIXTURE_INVALID", `${label} failed schema validation`, {
      errors: validate.errors ?? []
    });
  }
  return value as T;
}

export function validateTaskFixture(value: unknown): Promise<TaskFixture> {
  return assertSchema<TaskFixture>(value, "task-fixture.schema.json", "Task fixture");
}

export function validateRunReceipt(value: unknown): Promise<RunReceipt> {
  return assertSchema<RunReceipt>(value, "run-receipt/schema.json", "Run receipt");
}

export async function validateModelResponse(value: unknown): Promise<ModelResponse> {
  try {
    return await assertSchema<ModelResponse>(value, "model-response.schema.json", "Model response");
  } catch (error) {
    if (error instanceof OmlError) {
      throw new OmlError("OML_ADAPTER_RESPONSE_INVALID", error.message, error.details);
    }
    throw error;
  }
}
