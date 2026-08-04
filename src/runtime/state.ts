// Durable runtime state — ADR 0017, mandatory principle 9.
//
// Auditable and recoverable state under .oml/. Writes are atomic (temp file +
// rename), so an interrupted write never leaves a half-file that reads as valid.
// Every record is versioned; an unknown schema version is a hard error rather
// than a silent best-effort parse. A per-record content hash detects truncation.
//
// This is tamper-EVIDENT (a mutation is detectable via the hash and, for the
// event log, the chain in trace.ts) but NOT tamper-PROOF: the files live on the
// same filesystem as everything else and are not externally anchored. The
// limitations doc states this precisely; the code must not overclaim it.

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { canonicalJson, sha256 } from "../canonical.js";
import { OmlError } from "../errors.js";
import type { JsonValue } from "../types.js";

const STATE_SCHEMA_VERSION = "0.1";

// The run lifecycle is an explicit, deterministic state machine. Illegal
// transitions are refused; a terminal state cannot be re-finalized.
export type RunState =
  | "created"
  | "policy_admitted"
  | "executing"
  | "evidence_captured"
  | "claims_evaluated"
  | "finalized" // terminal
  | "aborted"; // terminal

const TERMINAL: ReadonlySet<RunState> = new Set<RunState>(["finalized", "aborted"]);

const TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  created: ["policy_admitted", "aborted"],
  policy_admitted: ["executing", "aborted"],
  executing: ["evidence_captured", "aborted"],
  evidence_captured: ["claims_evaluated", "aborted"],
  claims_evaluated: ["finalized", "aborted"],
  finalized: [],
  aborted: []
};

export function assertTransition(from: RunState, to: RunState): void {
  if (TERMINAL.has(from)) {
    throw new OmlError("OML_STATE_ALREADY_TERMINAL", `run is already ${from}`, { from, to });
  }
  if (!TRANSITIONS[from].includes(to)) {
    throw new OmlError("OML_STATE_TRANSITION_INVALID", `illegal transition ${from} -> ${to}`, { from, to });
  }
}

export interface StateEnvelope {
  schema_version: string;
  content_sha256: string;
  body: JsonValue;
}

// Atomic write: serialize, hash, write to a temp path, rename into place. A
// crash between write and rename leaves the temp file, never a torn target.
export async function writeStateFile(path: string, body: JsonValue): Promise<StateEnvelope> {
  const canonicalBody = canonicalJson(body);
  const envelope: StateEnvelope = {
    schema_version: STATE_SCHEMA_VERSION,
    content_sha256: sha256(canonicalBody),
    body
  };
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.tmp-${sha256(`${path}:${canonicalBody}`).slice(0, 16)}`;
  await writeFile(temp, `${canonicalJson(envelope as unknown as JsonValue)}\n`, { encoding: "utf8", flag: "w" });
  await rename(temp, path);
  return envelope;
}

// Read with schema-version and truncation detection. A partial write (torn JSON)
// or a content-hash mismatch is a hard error, not a silent recovery.
export async function readStateFile(path: string): Promise<JsonValue> {
  const raw = await readFile(path, "utf8");
  let parsed: StateEnvelope;
  try {
    parsed = JSON.parse(raw) as StateEnvelope;
  } catch {
    throw new OmlError("OML_STATE_PARTIAL_WRITE", "state file is not valid JSON (possible truncation)", { path });
  }
  if (parsed.schema_version !== STATE_SCHEMA_VERSION) {
    throw new OmlError("OML_STATE_SCHEMA_UNKNOWN", "unknown state schema version", {
      path,
      found: parsed.schema_version,
      expected: STATE_SCHEMA_VERSION
    });
  }
  const recomputed = sha256(canonicalJson(parsed.body));
  if (recomputed !== parsed.content_sha256) {
    throw new OmlError("OML_STATE_PARTIAL_WRITE", "state content hash mismatch (truncated or mutated)", { path });
  }
  return parsed.body;
}

export function statePath(root: string, runId: string, name: string): string {
  return join(root, ".oml", "runs", runId, name);
}
