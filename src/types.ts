export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface TokenUsage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
}

export interface TokenRates {
  input: number;
  cached_input: number;
  output: number;
}

export interface TaskFixture {
  schema_version: "0.2";
  id: string;
  issue: string;
  repository: { path: string; commit: string };
  adapter: {
    id: string;
    command: string[];
    model: string;
    model_snapshot: string;
    reasoning_effort: string;
    service_tier: "standard" | "batch" | "flex" | "fast" | "custom" | "not_applicable";
    prompt_sha256: string;
    skill_sha256: string | null;
    environment_allowlist?: string[];
    rates_usd_per_million_tokens: TokenRates;
  };
  environment: {
    id: string;
    definition_sha256: string;
    image_digest: string | null;
  };
  confidentiality: { hidden_paths: string[] };
  verifier: { command: string[]; success_exit_codes: number[] };
  limits: {
    adapter_timeout_ms: number;
    verifier_timeout_ms: number;
    max_output_bytes: number;
  };
  requires_security_sandbox?: boolean;
  metadata?: Record<string, string | number | boolean>;
}

export interface LoadedFixture {
  fixture: TaskFixture;
  fixtureDirectory: string;
  fixturePath: string;
  fixtureSha256: string;
}

export interface ModelRequest {
  schema_version: "0.3";
  run_id: string;
  task_id: string;
  issue: string;
  workspace: string;
  repository_commit: string;
  assistance?: JsonValue;
}

export type TreatmentId =
  | "native"
  | "lean_skill"
  | "equal_token"
  | "equal_cost"
  | "L1_context"
  | "L2_localization"
  | "L3_observation"
  | "L4_diagnosis"
  | "L5_plan"
  | "verification_gap";

export type InterventionLevel =
  | "L1_context"
  | "L2_localization"
  | "L3_observation"
  | "L4_diagnosis"
  | "L5_plan"
  | "verification_gap";

export type InterventionDesign = "cumulative" | "independent";

export interface SourceRegion {
  path: string;
  start_line: number;
  end_line: number;
}

export interface ContextComponent { regions: SourceRegion[] }
export interface LocalizationComponent {
  symbols: Array<{ path: string; name: string; kind: "function" | "method" | "class" | "module" | "variable" | "configuration" }>;
  failing_boundary: { producer_symbol: string; consumer_symbol: string; type: "call" | "return" | "state_write" | "async_callback" | "io" | "configuration" };
}
export interface ObservationComponent {
  facts: Array<{ statement: string; evidence_refs: string[]; certainty: "observed" | "inferred_from_trace" | "uncertain" }>;
}
export interface DiagnosisComponent {
  root_cause: string;
  supporting_evidence_refs: string[];
  certainty: "confirmed" | "high" | "qualified";
}
export interface PlanComponent {
  behavioral_objective: string;
  constraints: string[];
  non_goals: string[];
}
export interface VerificationGapComponent {
  unproven_behavior: string;
  required_evidence_categories: Array<"behavioral_test" | "regression_test" | "runtime_trace" | "static_analysis" | "visual_evidence" | "user_confirmation">;
}

export interface InterventionPayload {
  context?: ContextComponent;
  localization?: LocalizationComponent;
  observation?: ObservationComponent;
  diagnosis?: DiagnosisComponent;
  plan?: PlanComponent;
  verification_gap?: VerificationGapComponent;
}

export interface InterventionPacket {
  schema_version: "0.2";
  task_id: string;
  task_base_commit: string;
  intervention_level: InterventionLevel;
  design: InterventionDesign;
  payload: InterventionPayload;
  source: {
    kind: "human_validated" | "execution_derived" | "history_derived" | "synthetic_mechanics_only";
    evidence_refs: string[];
    fixed_commit_accessible_to_agent: false;
    facts_visible_from_base: boolean;
  };
  information_boundary: {
    allowed_categories: string[];
    forbidden_categories: string[];
    contains_diagnosis: boolean;
    contains_plan: boolean;
    contains_code_location: boolean;
    contains_exact_identifier: boolean;
    contains_patch_text: false;
  };
  review_record_sha256: string;
  provenance: {
    created_at: string;
    rubric_version: "oracle-boundary/1.0.0";
    revision: number;
    content_sha256: string;
  };
}

export interface InterventionDraft {
  schema_version: "0.1";
  task_id: string;
  task_base_commit: string;
  intervention_level: Exclude<InterventionLevel, "verification_gap">;
  design: InterventionDesign;
  payload: InterventionPayload;
  source: {
    kind: "model_authored_unreviewed" | InterventionPacket["source"]["kind"];
    evidence_refs: string[];
    fixed_commit_accessible_to_agent: false;
    facts_visible_from_base: boolean;
  };
  information_boundary: InterventionPacket["information_boundary"];
  review_status: "pending_independent_review";
  provenance: {
    author_id: string;
    author_class: "model_assisted_primary_author" | "human_primary_author";
    created_at: string;
    rubric_version: "oracle-boundary/1.0.0";
    revision: number;
    content_sha256: string;
  };
}

export interface InterventionReview {
  schema_version: "0.1";
  task_id: string;
  intervention_level: InterventionLevel;
  packet_content_sha256: string;
  author_id: string;
  reviews: Array<{
    reviewer_id: string;
    decision: "approve" | "reject" | "revision_required";
    leak_classification: "clean" | "possible_leak" | "confirmed_leak";
    assigned_level: InterventionLevel;
    reviewed_at: string;
  }>;
  disagreement: null | { present: true; summary: string; resolution: string | null };
  revision_history: Array<{ revision: number; content_sha256: string; changed_at: string }>;
  final_status: "approved" | "rejected" | "revision_required";
  finalized_at: string | null;
  review_policy_version: "intervention-review/1.0.0";
}

export interface ProposedFile {
  path: string;
  content: string;
}

export interface ModelResponse {
  schema_version: "0.1";
  files: ProposedFile[];
  claims: string[];
  usage: TokenUsage;
  billing: {
    accuracy: "exact_provider_reported" | "reconstructed" | "estimated" | "not_applicable";
    records: BillingRecord[];
    omitted_charge_categories: string[];
  };
  raw_trace?: JsonValue;
}

export interface BillingRecord {
  request_id: string;
  service_tier: string;
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  long_context_applied: boolean;
  token_cost_usd: number;
  tool_cost_usd: number;
  specialist_cost_usd: number;
  total_cost_usd: number;
  source: "provider_response" | "provider_invoice" | "reconstructed" | "estimate" | "test_double";
}

export interface ArtifactRecord {
  kind: string;
  sha256: string;
  bytes: number;
  relative_path: string;
}

export type RunStatus = "completed" | "error" | "cancelled";
export type AdapterStatus = "passed" | "failed" | "not_run";
export type ConfiguredVerifierStatus = "passed" | "failed" | "not_run";
export type ClaimEvaluationStatus = "not_evaluated" | "partially_evaluated" | "evaluated";
export type TerminalEvidenceStatus = "not_evaluated" | "insufficient" | "satisfied" | "waived";

export interface RunReceipt {
  schema_version: "0.3";
  run_id: string;
  task_id: string;
  task_fixture_sha256: string;
  run_status: RunStatus;
  adapter_status: { status: AdapterStatus; exit_code: number | null };
  configured_verifier: {
    status: ConfiguredVerifierStatus;
    exit_code: number | null;
  };
  claim_evaluation: {
    status: ClaimEvaluationStatus;
    evaluated_claim_count: number;
    total_claim_count: number;
  };
  terminal_evidence_status: TerminalEvidenceStatus;
  intervention: {
    treatment_id: TreatmentId;
    design: InterventionDesign | null;
    packet_file_sha256: string | null;
    packet_content_sha256: string | null;
    review_file_sha256: string | null;
  };
  model: string;
  model_snapshot: string;
  reasoning_effort: string;
  prompt_sha256: string;
  skill_sha256: string | null;
  repository_commit: string;
  isolation: "filesystem_copy_only" | "security_sandbox";
  environment: {
    id: string;
    definition_sha256: string;
    image_digest: string | null;
    platform: string;
    architecture: string;
    node_version: string;
  };
  evaluator_boundary: {
    classification: "interface_blind_host_confidentiality_not_enforced" | "confidentiality_enforced";
    detached_workspace: boolean;
    filtered_environment: boolean;
    treatment_metadata_declared: false;
    canary_count: number;
  };
  started_at: string;
  finished_at: string;
  duration_ms: number;
  usage: TokenUsage;
  cost_usd: number;
  cost_accuracy: "exact_provider_reported" | "reconstructed" | "estimated" | "not_applicable";
  billing_records: BillingRecord[];
  omitted_charge_categories: string[];
  trace_hash: string;
  artifacts: ArtifactRecord[];
  claims: string[];
  error_codes: string[];
}

export interface PricingSnapshot {
  schema_version: "1.0";
  snapshot_id: string;
  retrieved_at: string;
  currency: "USD";
  unit: "per_1m_text_tokens";
  sources: Array<{ id: string; url: string }>;
  models: Record<string, {
    input: number;
    cached_input: number;
    output: number;
    long_context?: {
      threshold_input_tokens: number;
      input_multiplier: number;
      output_multiplier: number;
    };
    cache_write_multiplier?: number;
  }>;
  derived_ratios: Record<string, number>;
  limitations: string[];
}

export interface PricingEvidence {
  schema_version: "1.0";
  evidence_id: string;
  retrieved_at: string;
  service_tier: "standard";
  sources: Array<{
    role: "pricing_table" | "model_rule";
    url: string;
    retrieved_at: string;
    method: string;
    content_type: string;
    evidence_path: string;
    evidence_sha256: string;
    normalization: string;
  }>;
  parser: { id: string; version: string; source_path: string; source_sha256: string };
  extracted: Record<string, {
    short_context: { input: number; cached_input: number; cache_write: number; output: number };
    long_context: { input: number; cached_input: number; cache_write: number; output: number };
  }>;
  derived_ratios: Record<string, number>;
  rules: { long_context_threshold_input_tokens: number; cache_write_multiplier: number };
  tool_charges: Array<{ name: string; amount_usd: number; unit: string }>;
  omissions: string[];
  limitations: string[];
}

export type DatasetSplit = "development" | "held_out" | "test";

export interface TaskManifestRecord {
  schema_version: "0.1";
  id: string;
  repository: { organization: string; name: string; base_commit: string; fixed_commit: string };
  split: DatasetSplit;
  task_statement: string;
  task_family: string;
  provenance: { source_url: string; license_spdx: string; derived_at: string };
  hashes: { base_archive_sha256: string; hidden_verifier_sha256: string };
  boundaries: { agent_visible_paths: string[]; hidden_paths: string[] };
}

export interface SplitPolicy {
  repository_disjoint: true;
  organization_disjoint: boolean;
}

export interface TaskPoolManifest {
  schema_version: "0.1";
  pool_id: string;
  constructed_at: string;
  selection_rule_version: string;
  candidates: TaskPoolCandidate[];
}

export interface TaskPoolCandidate {
  id: string;
  repository: { organization: string; name: string; base_commit: string; fixed_commit: string };
  task_source: { kind: "issue" | "pull_request" | "commit" | "curated"; url: string };
  task_statement: string;
  task_family: "bug_fix" | "ci_failure" | "regression" | "security" | "compatibility";
  language: "python" | "typescript" | "javascript";
  estimated_human_difficulty: "small" | "medium" | "large";
  visible_tests: string[];
  hidden_verifier: { available: boolean; sha256: string | null };
  environment: { reproducible: boolean; definition_sha256: string };
  licensing: { spdx: string; redistribution_permitted: boolean };
  contamination: { risk: "low" | "medium" | "high"; notes: string };
  mechanics: {
    base_fails_hidden_verifier: boolean;
    fixed_passes_hidden_verifier: boolean;
    infrastructure_valid: boolean;
    original_failure_evidence_ref: string;
    fixed_success_evidence_ref: string;
  };
  selection: { status: "candidate" | "included" | "excluded"; exclusion_reason: string | null; selected_at: string | null };
}

export interface TaskSelectionFreeze {
  schema_version: "0.1";
  freeze_id: string;
  created_at: string;
  selection_rule_version: string;
  task_pool_sha256: string;
  overlap_policy: "disallowed";
  representative_task_ids: string[];
  high_gap_task_ids: string[];
  representative_rule: { method: "systematic" | "seeded_random"; randomization_seed: number | null; stratification: string[] };
  high_gap_rule: {
    native_model_snapshot: string;
    native_runs_per_task: number;
    failure_rate_threshold: number;
    solvability_evidence: Array<"fixed_commit" | "qualified_human" | "sol_reference">;
    native_baseline_results_sha256: string;
  };
}

export interface ExperimentFreeze {
  schema_version: "0.1";
  freeze_id: string;
  created_at: string;
  task_selection_freeze_sha256: string;
  experiment_plan_sha256: string;
  task_fixtures: Array<{ task_id: string; fixture_sha256: string; repository_commit: string }>;
  interventions: Array<{
    task_id: string;
    treatment_id: InterventionLevel;
    design: InterventionDesign;
    packet_file_sha256: string;
    review_file_sha256: string;
  }>;
  prompts: { native_sha256: string; lean_skill_sha256: string | null };
  model_snapshot: string;
  reasoning_effort: string;
  environment_definition_sha256: string;
}

export interface GateMStudyFreeze {
  schema_version: "0.1";
  freeze_id: string;
  created_at: string;
  phase: "gate_m_method_validation";
  status: "pre_review" | "executable";
  capability_claim_permitted: false;
  code_identity: { commit: string; tree: string };
  model_execution: {
    live_model_calls: false;
    adapter_id: "deterministic-test-double";
    adapter_sha256: string;
    model_snapshot: "test-double/not-a-model@fixture-1";
    reasoning_effort: "none";
    prompt_sha256: string | null;
    skill_sha256: string | null;
  };
  review: {
    policy_sha256: string;
    blinded_schedule_sha256: string;
    required_distinct_reviewers: number;
    completed_distinct_reviewers: number;
    agreement_status: "pending" | "complete";
  };
  treatment_execution: {
    executable: boolean;
    schedule_sha256: string | null;
    blocked_by: string[];
  };
  scorer: {
    source_path: string;
    source_sha256: string;
    classification: "interface_blind_host_confidentiality_not_enforced" | "confidentiality_enforced";
  };
  pricing: { path: string; sha256: string; snapshot_id: string };
  tasks: Array<{
    task_id: string;
    manifest_sha256: string;
    base_commit: string;
    corrected_commit: string;
    evaluator_sha256: string;
    environment_definition_sha256: string;
  }>;
  artifacts: Array<{ role: "task" | "intervention_draft" | "review" | "evaluator" | "environment" | "pricing" | "scorer" | "protocol" | "adapter" | "schedule" | "code"; path: string; sha256: string }>;
  aggregate_sha256: string;
}

export type ExperimentTreatment = TreatmentId
  | "deterministic_baseline"
  | "training_free_baseline"
  | "learned_component"
  | "oracle_upper_bound"
  | "sol_reference";

export interface ExperimentPlan {
  schema_version: "0.2";
  id: string;
  gate: "M_method_validation" | "H_causal_headroom" | "A_approximation_feasibility";
  task_selection_freeze_sha256: string;
  task_ids: string[];
  primary_design: "cumulative_ladder" | "approximation_comparison" | "mechanics_only";
  treatments: ExperimentTreatment[];
  controls: {
    model_snapshot: string;
    reasoning_effort: string;
    max_attempts: number;
    token_budget: number;
    cost_budget_usd: number;
    timeout_ms: number;
    cache_mode: "disabled" | "enabled_recorded";
    service_tier: string;
    tool_permissions: string[];
    randomization_seed: number;
    repetitions: number;
    retain_all_attempts: true;
  };
  scoring: { hidden: true; treatment_blind: true; fixed_patch_inaccessible: true; other_arm_traces_inaccessible: true };
  analysis: {
    primary_generalization_unit: "task";
    minimum_meaningful_effect: number;
    representative_and_high_gap_reported_separately: true;
    repeats_not_counted_as_independent_tasks: true;
    minimum_sufficient_rule: string;
  };
}

export interface ExperimentAssignment {
  assignment_id: string;
  task_id: string;
  treatment_id: ExperimentTreatment;
  repetition: number;
}

export interface TraceEvent {
  schema_version: "0.1";
  run_id: string;
  sequence: number;
  timestamp: string;
  type: string;
  payload: Record<string, JsonValue>;
  previous_hash: string | null;
  hash: string;
}

export interface ProcessResult {
  exitCode: number | null;
  stdout: Buffer;
  stderr: Buffer;
  timedOut: boolean;
}
