# Repository migration plan

The original Gate A–C documents and ADRs remain as historical hypotheses. They
are marked superseded rather than deleted. Gate R0 corrects receipt semantics
and clarifies the implemented boundary.

## Sequence

1. Merge Gate R0 truth audit, pricing snapshot, status semantics, and candidate
   V2 ADRs.
2. Add a real provider adapter only when exact snapshot/effort/tool metadata and
   per-request billing can be recorded.
3. Build a small licensed executable pilot set with control-plane oracle labels.
4. Run the oracle ladder and equal-cost control.
5. Complete the strongest deterministic baseline matching the winning oracle
   class.
6. Decide whether one learned component is justified.

## Compatibility

Receipt schema 0.1's `status: verified` is not mapped to terminal evidence.
Readers must interpret it only as the legacy configured-verifier outcome.
Receipt schema 0.3 separates run, adapter, configured verifier, claim evaluation, and
terminal evidence, and records the intervention treatment and packet hash.

The 2026-08-02 method hardening adds Gate M before the migration sequence above
may proceed. ADRs 0011–0015 and evaluation plan V3 supersede the ambiguous full
ladder and mixed oracle/component comparison without deleting this history.

No migration may expose fixed commits, hidden verifiers, oracle labels, or
teacher patches to agent-visible workspaces. No normal-mode adapter may contain
a hidden Sol route.
