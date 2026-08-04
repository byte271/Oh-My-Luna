# Blinded intervention review rubric

Classify the strongest information contained in the packet, not the level that
its author may have intended.

- L1: relevant base paths and bounded ranges only.
- L2: L1 plus base-state symbols and a structural failing boundary.
- L3: prior information plus raw execution facts, without causal interpretation.
- L4: prior information plus causal diagnosis, without a prescribed repair.
- L5: prior information plus behavioral objective, constraints, and non-goals,
  without implementation instructions.

For every sentence, flag information from a later level, fixed-only identifiers,
hidden evaluator details, patch-like wording, unnecessary specificity, or close
similarity to the repair. Record sentence-level comments for each suspected
disclosure. Reviewers must not see another reviewer's answer.

Answer all questions in `answer-template.json`. Choose `collapse_levels` when
L3 and L4 cannot be separated usefully on the frozen wording.
