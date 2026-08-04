import { OmlError } from "../errors.js";

/**
 * Hard limits on a live provider run.
 *
 * Both caps are enforced before a request is sent, not after. A run that would
 * exceed either cap fails closed with a deterministic error rather than
 * completing and reporting an overspend.
 */
export interface BudgetLimits {
  /** Maximum number of provider requests this run may issue. */
  readonly max_requests: number;
  /** Maximum total spend in USD this run may incur. */
  readonly max_total_usd: number;
  /**
   * Maximum spend for any single request, checked against the pre-flight
   * estimate. Guards against one pathological request consuming the run.
   */
  readonly max_request_usd: number;
}

export interface BudgetState {
  readonly requests_issued: number;
  readonly spent_usd: number;
  readonly limits: BudgetLimits;
}

/**
 * Enforces request and dollar caps across a run.
 *
 * `reserve` is called before a request with a conservative cost estimate;
 * `settle` records what the provider actually reported. Reservation uses the
 * estimate so the cap holds even when the true cost is only known afterwards.
 */
export class BudgetGuard {
  readonly #limits: BudgetLimits;
  #requests = 0;
  #spent = 0;
  #reserved = 0;

  constructor(limits: BudgetLimits) {
    if (!(limits.max_requests > 0) || !Number.isFinite(limits.max_requests)) {
      throw new OmlError("OML_BUDGET_INVALID", "max_requests must be a positive finite number");
    }
    if (!(limits.max_total_usd > 0) || !Number.isFinite(limits.max_total_usd)) {
      throw new OmlError("OML_BUDGET_INVALID", "max_total_usd must be a positive finite number");
    }
    if (!(limits.max_request_usd > 0) || !Number.isFinite(limits.max_request_usd)) {
      throw new OmlError("OML_BUDGET_INVALID", "max_request_usd must be a positive finite number");
    }
    if (limits.max_request_usd > limits.max_total_usd) {
      throw new OmlError("OML_BUDGET_INVALID", "max_request_usd cannot exceed max_total_usd");
    }
    this.#limits = limits;
  }

  get state(): BudgetState {
    return { requests_issued: this.#requests, spent_usd: this.#spent, limits: this.#limits };
  }

  /** Throws unless one more request costing at most `estimateUsd` is permitted. */
  reserve(estimateUsd: number): void {
    if (!Number.isFinite(estimateUsd) || estimateUsd < 0) {
      throw new OmlError("OML_BUDGET_INVALID", "Cost estimate must be a non-negative finite number");
    }
    if (this.#requests + 1 > this.#limits.max_requests) {
      throw new OmlError("OML_BUDGET_EXCEEDED", "Request cap reached", {
        requests_issued: this.#requests,
        max_requests: this.#limits.max_requests
      });
    }
    if (estimateUsd > this.#limits.max_request_usd) {
      throw new OmlError("OML_BUDGET_EXCEEDED", "Single-request cost estimate exceeds the per-request cap", {
        estimate_usd: estimateUsd,
        max_request_usd: this.#limits.max_request_usd
      });
    }
    const projected = this.#spent + this.#reserved + estimateUsd;
    if (projected > this.#limits.max_total_usd) {
      throw new OmlError("OML_BUDGET_EXCEEDED", "Projected spend exceeds the total cap", {
        spent_usd: this.#spent,
        reserved_usd: this.#reserved,
        estimate_usd: estimateUsd,
        max_total_usd: this.#limits.max_total_usd
      });
    }
    this.#reserved += estimateUsd;
    this.#requests += 1;
  }

  /** Records the actual cost of a reserved request and releases the reservation. */
  settle(estimateUsd: number, actualUsd: number): void {
    this.#reserved = Math.max(0, this.#reserved - estimateUsd);
    this.#spent += actualUsd;
  }
}
