# Gate M blinded review export

This directory is the reviewer-facing export. Give reviewers this subtree only;
do not provide `tasks/gate-m/review-control`, task `control` directories, author
records, or another reviewer's answers.

Each opaque directory contains one frozen draft without its target level, the
base-state issue and source excerpt, an exact relevant repair diff for disclosure
comparison, and an unanswered review form. The repair diff is reviewer-only and
must never enter a model task workspace.

No independent review has been completed. The files named `answer-template.json`
are blank templates, not review records.
