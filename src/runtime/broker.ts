// Policy + execution broker — ADR 0017, the single boundary seam.
//
// Every privileged action (write, exec) crosses this broker. It layers
// deterministic admissibility on top of the existing primitives:
//   - applyProposedFiles (environment.ts) already does path/symlink rejection;
//   - runProcess (process.ts) already does shell-free spawn, env allowlist,
//     timeout, output cap, cancellation.
// The broker adds what those lack: an executable allowlist, an argument policy,
// an environment SUBSET check, write-path scoping inside the workspace, and
// budget accounting — each with a stable OML_* denial code.
//
// The broker owns NO credentials and makes NO model calls. It is fully offline
// and deterministic.

import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { applyProposedFiles } from "../environment.js";
import { runProcess } from "../process.js";
import { OmlError } from "../errors.js";
import { sha256 } from "../canonical.js";
import type { ProcessResult } from "../types.js";
import type {
  BrokerRequest,
  BudgetLedger,
  ExecRequest,
  ExecutionPolicy,
  PolicyDecision,
  WriteRequest
} from "./types.js";

function inside(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation);
}

export function validatePolicy(policy: ExecutionPolicy): void {
  if (!isAbsolute(policy.workspace_root)) {
    throw new OmlError("OML_POLICY_INVALID", "workspace_root must be absolute", { workspace_root: policy.workspace_root });
  }
  const enforced = new Set(["cpu", "memory", "disk", "network", "syscalls", "process_tree"]);
  // Every resource the runtime cannot bound MUST be disclosed in `unattested`.
  // A policy that omits one is invalid, so a reader is never misled into
  // thinking an unbounded resource is bounded (mandatory principle 8).
  for (const name of enforced) {
    if (!policy.limits.unattested.includes(name as (typeof policy.limits.unattested)[number])) {
      throw new OmlError("OML_POLICY_INVALID", `unattested resource not disclosed: ${name}`, { resource: name });
    }
  }
  for (const rule of policy.permitted_executables) {
    if (rule.argv_policy.mode === "regex_per_arg") {
      for (const pattern of rule.argv_policy.arg_patterns ?? []) {
        try {
          new RegExp(pattern, "u");
        } catch {
          throw new OmlError("OML_POLICY_INVALID", "invalid arg pattern", { rule: rule.id, pattern });
        }
      }
    }
  }
}

function emptyLedger(): BudgetLedger {
  return { commands_used: 0, retries_used: 0, files_generated: 0, write_bytes_used: 0 };
}

function matchExecutable(policy: ExecutionPolicy, argv: string[]): PolicyDecision | null {
  const command = argv[0];
  if (command === undefined) {
    return { admitted: false, code: "OML_ARG_REJECTED", reason: "argv is empty" };
  }
  const rule = policy.permitted_executables.find((candidate) => candidate.id === command);
  if (!rule) {
    return {
      admitted: false,
      code: "OML_EXECUTABLE_NOT_PERMITTED",
      reason: `executable not on allowlist: ${command}`
    };
  }
  const args = argv.slice(1);
  const p = rule.argv_policy;
  if (p.mode === "any") return null;
  if (p.mode === "exact") {
    const ok = JSON.stringify(p.allowed_argv ?? []) === JSON.stringify(argv);
    return ok ? null : { admitted: false, code: "OML_ARG_REJECTED", reason: "argv does not match exact policy" };
  }
  if (p.mode === "prefix") {
    const prefix = p.allowed_argv ?? [];
    const ok = prefix.every((token, index) => argv[index] === token);
    return ok ? null : { admitted: false, code: "OML_ARG_REJECTED", reason: "argv does not match prefix policy" };
  }
  // regex_per_arg
  const patterns = p.arg_patterns ?? [];
  if (patterns.length !== args.length) {
    return { admitted: false, code: "OML_ARG_REJECTED", reason: "argument count does not match policy" };
  }
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    const pattern = patterns[index];
    if (pattern === undefined || !new RegExp(pattern, "u").test(arg)) {
      return { admitted: false, code: "OML_ARG_REJECTED", reason: `argument ${index} rejected by policy` };
    }
  }
  return null;
}

// Broker holds mutable per-run budget state. One broker per run.
export class Broker {
  readonly #policy: ExecutionPolicy;
  #ledger: BudgetLedger = emptyLedger();

  constructor(policy: ExecutionPolicy) {
    validatePolicy(policy);
    this.#policy = policy;
  }

  get ledger(): Readonly<BudgetLedger> {
    return { ...this.#ledger };
  }

  // Pure admissibility check. No side effects; used both by callers who want to
  // pre-check and by the apply/exec methods below.
  decide(request: BrokerRequest): PolicyDecision {
    if (request.kind === "write") return this.#decideWrite(request);
    return this.#decideExec(request);
  }

  #decideWrite(request: WriteRequest): PolicyDecision {
    if (isAbsolute(request.path) || request.path.includes("\0")) {
      return { admitted: false, code: "OML_PATH_ESCAPE", reason: "write path must be relative and null-free" };
    }
    const target = resolve(this.#policy.workspace_root, request.path);
    if (!inside(this.#policy.workspace_root, target)) {
      return { admitted: false, code: "OML_PATH_ESCAPE", reason: "write path escapes workspace root" };
    }
    // write_paths, when present, further restrict inside the workspace.
    if (this.#policy.write_paths.length > 0) {
      const normalized = relative(this.#policy.workspace_root, target).replaceAll("\\", "/");
      const permitted = this.#policy.write_paths.some(
        (prefix) => normalized === prefix || normalized.startsWith(`${prefix.replace(/\/$/, "")}/`)
      );
      if (!permitted) {
        return { admitted: false, code: "OML_PATH_NOT_WRITABLE", reason: `write outside permitted paths: ${normalized}` };
      }
    }
    const bytes = Buffer.byteLength(request.content, "utf8");
    if (this.#ledger.files_generated + 1 > this.#policy.limits.max_generated_files) {
      return { admitted: false, code: "OML_FILE_COUNT_BUDGET_EXCEEDED", reason: "generated-file budget exceeded" };
    }
    if (this.#ledger.write_bytes_used + bytes > this.#policy.limits.max_write_bytes) {
      return { admitted: false, code: "OML_WRITE_BYTES_BUDGET_EXCEEDED", reason: "write-bytes budget exceeded" };
    }
    return { admitted: true, code: null, reason: "admitted" };
  }

  #decideExec(request: ExecRequest): PolicyDecision {
    const executableDecision = matchExecutable(this.#policy, request.argv);
    if (executableDecision) return executableDecision;
    // Requested env allowlist must be a SUBSET of the policy allowlist. A run can
    // narrow but never widen the environment it was granted.
    for (const name of request.environmentAllowlist ?? []) {
      if (!this.#policy.environment_allowlist.includes(name)) {
        return { admitted: false, code: "OML_ENV_NOT_ALLOWLISTED", reason: `env not allowlisted: ${name}` };
      }
    }
    if (this.#ledger.commands_used + 1 > this.#policy.limits.max_command_count) {
      return { admitted: false, code: "OML_COMMAND_BUDGET_EXCEEDED", reason: "command budget exceeded" };
    }
    return { admitted: true, code: null, reason: "admitted" };
  }

  // Apply a write through the boundary. Reuses applyProposedFiles for the
  // realpath/symlink enforcement, then commits the budget.
  async applyWrite(request: WriteRequest): Promise<string[]> {
    const decision = this.#decideWrite(request);
    if (!decision.admitted) {
      throw new OmlError(decision.code as never, decision.reason, { path: request.path });
    }
    const changed = await applyProposedFiles(this.#policy.workspace_root, [
      { path: request.path, content: request.content }
    ]);
    this.#ledger.files_generated += 1;
    this.#ledger.write_bytes_used += Buffer.byteLength(request.content, "utf8");
    return changed;
  }

  // Execute a process through the boundary. Reuses runProcess for spawn/timeout/
  // output-cap/cancel; the broker owns admissibility and budget.
  async exec(request: ExecRequest, signal?: AbortSignal): Promise<ProcessResult> {
    const decision = this.#decideExec(request);
    if (!decision.admitted) {
      throw new OmlError(decision.code as never, decision.reason, { argv: request.argv });
    }
    const cwd = isAbsolute(request.cwd) ? request.cwd : resolve(this.#policy.workspace_root, request.cwd);
    if (!inside(this.#policy.workspace_root, cwd) && cwd !== this.#policy.workspace_root) {
      throw new OmlError("OML_PATH_ESCAPE", "cwd escapes workspace root", { cwd: request.cwd });
    }
    this.#ledger.commands_used += 1;
    return await runProcess({
      argv: request.argv,
      cwd,
      ...(request.stdin === undefined ? {} : { stdin: Buffer.from(request.stdin, "utf8") }),
      timeoutMs: this.#policy.limits.wall_clock_ms,
      maxOutputBytes: this.#policy.limits.max_output_bytes,
      environmentAllowlist: request.environmentAllowlist ?? this.#policy.environment_allowlist,
      ...(signal === undefined ? {} : { signal })
    });
  }

  // Bounded retry helper: a retry consumes the retry budget explicitly, so a
  // retry loop cannot silently exceed intended attempts (mandatory principle 8).
  chargeRetry(): void {
    if (this.#ledger.retries_used + 1 > this.#policy.limits.max_retries) {
      throw new OmlError("OML_RETRY_BUDGET_EXCEEDED", "retry budget exceeded", {
        max_retries: this.#policy.limits.max_retries
      });
    }
    this.#ledger.retries_used += 1;
  }
}

// Convenience: a deterministic hash of the resolved executable PATH string
// (not the binary bytes — see schema note). Callers that pin executables use
// this to populate resolved_path_sha256.
export async function hashResolvedExecutable(path: string): Promise<string> {
  const real = await realpath(path);
  return sha256(real);
}
