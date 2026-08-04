import { appendFile, readFile } from "node:fs/promises";
import { canonicalJson, sha256 } from "./canonical.js";
import { OmlError } from "./errors.js";
import type { JsonValue, TraceEvent } from "./types.js";

type UnhashedTraceEvent = Omit<TraceEvent, "hash">;

export class TraceWriter {
  readonly #path: string;
  readonly #runId: string;
  #sequence = 0;
  #previousHash: string | null = null;

  constructor(path: string, runId: string) {
    this.#path = path;
    this.#runId = runId;
  }

  get lastHash(): string | null {
    return this.#previousHash;
  }

  async append(type: string, payload: Record<string, JsonValue>): Promise<TraceEvent> {
    const base: UnhashedTraceEvent = {
      schema_version: "0.1",
      run_id: this.#runId,
      sequence: this.#sequence,
      timestamp: new Date().toISOString(),
      type,
      payload,
      previous_hash: this.#previousHash
    };
    const hash = sha256(canonicalJson(base as unknown as JsonValue));
    const event: TraceEvent = { ...base, hash };
    await appendFile(this.#path, `${canonicalJson(event as unknown as JsonValue)}\n`, { encoding: "utf8", flag: "a" });
    this.#sequence += 1;
    this.#previousHash = hash;
    return event;
  }
}

export async function verifyTrace(path: string): Promise<string> {
  const lines = (await readFile(path, "utf8")).split("\n").filter(Boolean);
  let previousHash: string | null = null;
  for (let sequence = 0; sequence < lines.length; sequence += 1) {
    const event = JSON.parse(lines[sequence] ?? "") as TraceEvent;
    if (event.sequence !== sequence || event.previous_hash !== previousHash) {
      throw new OmlError("OML_INTERNAL", "Trace chain ordering is invalid", { sequence });
    }
    const { hash, ...base } = event;
    if (sha256(canonicalJson(base as unknown as JsonValue)) !== hash) {
      throw new OmlError("OML_INTERNAL", "Trace event hash is invalid", { sequence });
    }
    previousHash = hash;
  }
  if (!previousHash) throw new OmlError("OML_INTERNAL", "Trace is empty");
  return previousHash;
}
