// Readiness surfaces — ADR 0017, mandatory principle 5.
//
// THREE separate, machine-checkable boundaries, deliberately not collapsible:
//
//   doctor      — installation readiness. Tools present, versions sane, paths
//                 writable. A GREEN doctor implies NONE of: provider auth, a
//                 model call, task solvability, prompt sufficiency, verifier
//                 validity, or sandbox existence. That disclaimer is returned
//                 in the result itself so it cannot be dropped.
//
//   smoke       — execution readiness, OFFLINE. The broker can apply a write and
//                 run a permitted process end to end against a throwaway policy.
//                 No provider, no credential, no spend.
//
//   sufficiency — the model is actually given the information the task requires.
//                 This is the boundary Gate H v1 lacked: it caught neither the
//                 missing source nor a reference to a file the execution path
//                 cannot read. A stub must never be more informed than the model.
//
// Each returns a typed result with an explicit `implies_not` list so a green on
// one surface is never read as a green on another.

import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { Broker } from "./broker.js";
import type { ExecutionPolicy } from "./types.js";

export interface ReadinessResult {
  surface: "doctor" | "smoke" | "sufficiency";
  ready: boolean;
  checks: Array<{ id: string; ok: boolean; detail: string }>;
  // What a GREEN on this surface explicitly does NOT establish.
  implies_not: string[];
}

export interface DoctorInput {
  // A path the runtime will need to write to (the runs root). Injected so the
  // check exercises the real filesystem, not an assumption.
  probeWritableDir: string;
  // process.version, overridable for testability. Defaults to the live runtime.
  nodeVersion?: string;
}

export async function doctor(input: DoctorInput): Promise<ReadinessResult> {
  const checks: ReadinessResult["checks"] = [];
  const version = input.nodeVersion ?? process.version;
  const major = Number(version.replace(/^v/, "").split(".")[0] ?? "0");
  checks.push({
    id: "node_version",
    ok: major >= 20,
    detail: `node ${version} (require >= 20)`
  });
  let writable = false;
  try {
    await access(input.probeWritableDir, constants.W_OK);
    writable = true;
  } catch {
    writable = false;
  }
  checks.push({ id: "writable_runs_root", ok: writable, detail: input.probeWritableDir });
  return {
    surface: "doctor",
    ready: checks.every((check) => check.ok),
    checks,
    implies_not: [
      "provider_auth",
      "a_model_call_succeeds",
      "task_is_solvable",
      "prompt_is_sufficient",
      "verifier_is_valid",
      "an_os_sandbox_contains_the_process"
    ]
  };
}

export interface SufficiencyInput {
  // The task requires the model to reproduce/modify these paths, each of which
  // must be BOTH provided to the model AND readable by the execution path. If a
  // reproduction task's source is absent from what the model receives, the
  // prompt is insufficient regardless of every integrity check passing.
  required_paths: string[];
  // The set of paths actually provided to the model (assembled prompt inputs,
  // or the readable workspace when tools are available).
  provided_paths: string[];
  // Named needs the task cannot meet with what it was given (e.g. a network
  // fetch when no tool provides one). Non-empty ⇒ unsatisfiable as posed. This
  // is the boundary Gate H v1 lacked.
  unsatisfiable_without_tools?: string[];
}

export async function sufficiency(input: SufficiencyInput): Promise<ReadinessResult> {
  const checks: ReadinessResult["checks"] = [];
  const provided = new Set(input.provided_paths);
  const missing = input.required_paths.filter((path) => !provided.has(path));

  checks.push({
    id: "required_paths_provided",
    ok: missing.length === 0,
    detail: missing.length === 0 ? "all required paths provided" : `missing: ${missing.join(", ")}`
  });

  const unmet = input.unsatisfiable_without_tools ?? [];
  checks.push({
    id: "unsatisfiable_without_tools",
    ok: unmet.length === 0,
    detail:
      unmet.length === 0
        ? "no unmet tool dependency"
        : `task needs tools it was not given: ${unmet.join(", ")} (this is the Gate H v1 defect)`
  });

  // Each provided path must actually be readable by the execution path — a
  // reference to an inaccessible file is not sufficiency, it is a false input.
  const unreadable: string[] = [];
  for (const path of input.provided_paths) {
    try {
      await readFile(path);
    } catch {
      unreadable.push(path);
    }
  }
  checks.push({
    id: "provided_paths_readable",
    ok: unreadable.length === 0,
    detail: unreadable.length === 0 ? "all provided paths readable" : `unreadable: ${unreadable.join(", ")}`
  });

  return {
    surface: "sufficiency",
    ready: checks.every((check) => check.ok),
    checks,
    implies_not: ["prompt_quality_beyond_presence", "task_is_solvable", "the_answer_is_derivable"]
  };
}

export interface SmokeInput {
  // A writable, absolute directory the broker may treat as its workspace root.
  // Callers pass a throwaway temp dir; smoke never touches the real repository.
  workspaceRoot: string;
  // The executable smoke will run end to end. Defaults to the running Node
  // binary, which is guaranteed present and cross-platform. Injected for tests.
  executablePath: string;
}

// Execution readiness, OFFLINE. Proves the broker can (a) admit and apply a
// scoped write and (b) admit and run a permitted process end to end, committing
// budget, with no provider, credential, or spend. A GREEN smoke says the
// execution seam works on this host; it says NOTHING about whether a real task's
// verifier is valid, whether the model is reachable, or whether an OS sandbox
// contains the process (there is none — see limitations doc).
export async function smoke(input: SmokeInput): Promise<ReadinessResult> {
  const checks: ReadinessResult["checks"] = [];
  const token = "OML_SMOKE_OK";

  const policy: ExecutionPolicy = {
    workspace_root: input.workspaceRoot,
    read_paths: [],
    write_paths: [],
    symlink_policy: "reject",
    permitted_executables: [
      {
        id: input.executablePath,
        resolved_path_sha256: null,
        argv_policy: { mode: "prefix", allowed_argv: [input.executablePath, "-e"] }
      }
    ],
    environment_allowlist: [],
    limits: {
      wall_clock_ms: 10_000,
      max_output_bytes: 4096,
      max_command_count: 1,
      max_retries: 0,
      max_generated_files: 1,
      max_write_bytes: 1024,
      unattested: ["cpu", "memory", "disk", "network", "syscalls", "process_tree"]
    }
  };

  let broker: Broker;
  try {
    broker = new Broker(policy);
    checks.push({ id: "policy_valid", ok: true, detail: "throwaway policy accepted by broker" });
  } catch (error) {
    checks.push({ id: "policy_valid", ok: false, detail: (error as Error).message });
    return { surface: "smoke", ready: false, checks, implies_not: SMOKE_IMPLIES_NOT };
  }

  try {
    const changed = await broker.applyWrite({ kind: "write", path: "smoke.txt", content: token });
    checks.push({
      id: "broker_apply_write",
      ok: changed.includes("smoke.txt"),
      detail: `wrote ${changed.join(", ") || "(nothing)"}`
    });
  } catch (error) {
    checks.push({ id: "broker_apply_write", ok: false, detail: (error as Error).message });
  }

  try {
    const result = await broker.exec({
      kind: "exec",
      argv: [input.executablePath, "-e", `process.stdout.write(${JSON.stringify(token)})`],
      cwd: "."
    });
    const stdout = result.stdout.toString("utf8");
    checks.push({
      id: "broker_exec_process",
      ok: result.exitCode === 0 && stdout === token,
      detail: `exit=${String(result.exitCode)} stdout=${JSON.stringify(stdout)}`
    });
    checks.push({
      id: "command_budget_committed",
      ok: broker.ledger.commands_used === 1,
      detail: `commands_used=${broker.ledger.commands_used}`
    });
  } catch (error) {
    checks.push({ id: "broker_exec_process", ok: false, detail: (error as Error).message });
  }

  return {
    surface: "smoke",
    ready: checks.every((check) => check.ok),
    checks,
    implies_not: SMOKE_IMPLIES_NOT
  };
}

const SMOKE_IMPLIES_NOT = [
  "provider_auth",
  "a_model_call_succeeds",
  "task_verifier_is_valid",
  "prompt_is_sufficient",
  "an_os_sandbox_contains_the_process"
];
