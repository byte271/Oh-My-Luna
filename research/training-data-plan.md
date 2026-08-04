# Training data plan

Status: design only; training is prohibited until the bottleneck study selects
one target.

## Accepted task record

`schemas/task-manifest.schema.json` records base and fixed commits, split,
provenance, SPDX license identity, content hashes, and visible/hidden path
boundaries. The fixed commit and hidden verifier are control-plane data and
must never be copied into the agent workspace.

A historical candidate is admitted only after independent execution shows:

1. the base reproduces the intended failure;
2. the fixed commit passes the hidden verifier;
3. pass-to-pass behavior remains within declared bounds;
4. task text, visible tests, logs, and Git history do not reveal the fix;
5. the environment is reproducible from a pinned definition;
6. license and redistribution decisions are recorded;
7. a human or independent validation step confirms semantic fidelity.

Commit messages and patch diffs are oracle-side by default. Automatically
derived labels are not promoted to human-validated labels.

## Splits and leakage

The minimum policy is commit-, issue-, and repository-disjoint. The main
generalization result uses organization-disjoint tasks where licensing and
sample size permit. Time separation is recorded rather than claimed when dates
are incomplete. `src/leakage.ts` detects repository/organization cross-split
overlap, visible hidden paths, identical base/fixed commits, and fixed-commit
disclosure. These checks are necessary, not sufficient: semantic duplicates
still require independent review or similarity analysis.

## Trajectory labels

`schemas/trajectory.schema.json` records exact model snapshot and effort,
outcome, failure classes, first irreversible failure, relevant files/symbols,
root-cause regions, decisive observations, and label source. Execution-derived,
automatic, and human labels remain distinguishable.

## First possible training target

No target is selected. If oracle context is causal and the deterministic ranker
fails, start with relevant-file ranking. Candidate progression: lexical/graph
features → small encoder → cross-encoder. Do not use a generative model for a
ranking-only question. If oracle diagnosis alone is causal, first train a
hypothesis ranker or next-observation selector, not a general diagnostic agent.

Required model card fields are dataset version/hash, input limit, negative
sampling, loss, calibration method, abstention threshold, seed, checkpoint hash,
hardware, energy/time estimate, quantization, license, latency, and snapshot
compatibility. A mechanical tiny-fixture training run is pipeline validation
only and cannot support a capability claim.
