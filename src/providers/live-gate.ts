import { OmlError } from "../errors.js";

/**
 * Authorization boundary for spending money.
 *
 * Three independent signals must all be present in the environment. None is
 * ever read from source, committed, or logged. Absence of any one keeps live
 * execution blocked, and the block is the default state.
 *
 *   OPENAI_API_KEY        credential
 *   OML_LIVE_APPROVED=1   explicit human approval for this run
 *   OML_LIVE_BUDGET_USD   positive dollar limit for this session
 *
 * A prompt instructing the agent to proceed is not approval. Only the
 * environment is.
 */

export interface LiveAuthorization {
  readonly apiKey: string;
  readonly budgetUsd: number;
}

export type LiveGateResult =
  | { readonly authorized: true; readonly authorization: LiveAuthorization }
  | { readonly authorized: false; readonly reason: LiveBlockReason; readonly detail: string };

export type LiveBlockReason =
  | "no_credential"
  | "not_approved"
  | "no_budget"
  | "invalid_budget";

/**
 * Inspects the environment without throwing, so callers can report why live
 * execution is blocked instead of failing opaquely.
 */
export function checkLiveAuthorization(env: NodeJS.ProcessEnv = process.env): LiveGateResult {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return { authorized: false, reason: "no_credential", detail: "OPENAI_API_KEY is not set" };
  }
  if (env.OML_LIVE_APPROVED !== "1") {
    return { authorized: false, reason: "not_approved", detail: "OML_LIVE_APPROVED is not exactly \"1\"" };
  }
  const raw = env.OML_LIVE_BUDGET_USD;
  if (raw === undefined || raw.trim().length === 0) {
    return { authorized: false, reason: "no_budget", detail: "OML_LIVE_BUDGET_USD is not set" };
  }
  const budgetUsd = Number(raw);
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
    return { authorized: false, reason: "invalid_budget", detail: "OML_LIVE_BUDGET_USD must be a positive finite number" };
  }
  return { authorized: true, authorization: { apiKey, budgetUsd } };
}

/** Throws unless every authorization signal is present. */
export function requireLiveAuthorization(env: NodeJS.ProcessEnv = process.env): LiveAuthorization {
  const result = checkLiveAuthorization(env);
  if (!result.authorized) {
    throw new OmlError("OML_PROVIDER_LIVE_EXECUTION_BLOCKED", `Live execution is blocked: ${result.detail}`, {
      reason: result.reason
    });
  }
  return result.authorization;
}

/**
 * The pre-flight disclosure recorded before the provider is contacted. Emitted
 * whether or not the call then succeeds, so an operator can always reconstruct
 * what was about to be spent and why.
 */
export interface PreflightDisclosure {
  readonly requested_model: string;
  readonly task_id: string;
  readonly treatment: string;
  readonly max_output_tokens: number;
  readonly reasoning_effort: string;
  readonly pessimistic_max_cost_usd: number;
  readonly remaining_budget_usd: number;
  readonly documentation_evidence_id: string;
  readonly sdk_version: string;
}

export function formatPreflight(disclosure: PreflightDisclosure): string {
  return [
    "pre-flight (no request has been sent yet)",
    `  requested model        ${disclosure.requested_model}`,
    `  task                   ${disclosure.task_id}`,
    `  treatment              ${disclosure.treatment}`,
    `  max output tokens      ${disclosure.max_output_tokens}`,
    `  reasoning effort       ${disclosure.reasoning_effort}`,
    `  pessimistic max cost   $${disclosure.pessimistic_max_cost_usd.toFixed(6)}`,
    `  remaining budget       $${disclosure.remaining_budget_usd.toFixed(4)}`,
    `  documentation evidence ${disclosure.documentation_evidence_id}`,
    `  sdk version            ${disclosure.sdk_version}`
  ].join("\n");
}
