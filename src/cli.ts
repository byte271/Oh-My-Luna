#!/usr/bin/env node
import { resolve } from "node:path";
import { runEvaluation } from "./runner.js";
import { toOmlError } from "./errors.js";

function usage(): never {
  process.stderr.write("Usage: oh-my-luna-eval run <fixture.json> [--runs <directory>] [--treatment <id>] [--intervention <packet.json> --review <review.json> --design <cumulative|independent> --packet-sha <sha256> --review-sha <sha256>] [--fixture-sha <sha256>] [--repository-commit <commit>] [--experiment-freeze <freeze.json> --experiment-freeze-sha <sha256>] [--minimum-reviewers <n>]\n");
  process.exit(2);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args[0] !== "run" || !args[1]) usage();
  let runsRoot = resolve(".oml-runs");
  const runsIndex = args.indexOf("--runs");
  if (runsIndex >= 0) {
    const value = args[runsIndex + 1];
    if (!value) usage();
    runsRoot = resolve(value);
  }
  const treatmentIndex = args.indexOf("--treatment");
  const treatment = treatmentIndex >= 0 ? args[treatmentIndex + 1] : undefined;
  const validTreatments = new Set([
    "native", "lean_skill", "equal_token", "equal_cost", "L1_context", "L2_localization",
    "L3_observation", "L4_diagnosis", "L5_plan", "verification_gap"
  ]);
  if (treatment !== undefined && !validTreatments.has(treatment)) usage();
  const interventionIndex = args.indexOf("--intervention");
  const interventionPath = interventionIndex >= 0 ? args[interventionIndex + 1] : undefined;
  if (interventionIndex >= 0 && !interventionPath) usage();
  const reviewIndex = args.indexOf("--review");
  const interventionReviewPath = reviewIndex >= 0 ? args[reviewIndex + 1] : undefined;
  if (reviewIndex >= 0 && !interventionReviewPath) usage();
  const designIndex = args.indexOf("--design");
  const interventionDesign = designIndex >= 0 ? args[designIndex + 1] : undefined;
  if (interventionDesign !== undefined && interventionDesign !== "cumulative" && interventionDesign !== "independent") usage();
  const packetSha = option(args, "--packet-sha");
  const reviewSha = option(args, "--review-sha");
  const fixtureSha = option(args, "--fixture-sha");
  const experimentFreezeSha = option(args, "--experiment-freeze-sha");
  for (const digest of [packetSha, reviewSha, fixtureSha, experimentFreezeSha]) {
    if (digest !== undefined && !/^[a-f0-9]{64}$/u.test(digest)) usage();
  }
  const repositoryCommit = option(args, "--repository-commit");
  const experimentFreezePath = option(args, "--experiment-freeze");
  if ((experimentFreezePath === undefined) !== (experimentFreezeSha === undefined)) usage();
  if ((interventionPath === undefined) !== (packetSha === undefined) || (interventionReviewPath === undefined) !== (reviewSha === undefined)) usage();
  const minimumReviewersText = option(args, "--minimum-reviewers");
  const minimumReviewers = minimumReviewersText === undefined ? undefined : Number(minimumReviewersText);
  if (minimumReviewers !== undefined && (!Number.isInteger(minimumReviewers) || minimumReviewers < 1)) usage();
  const result = await runEvaluation({
    fixturePath: args[1],
    runsRoot,
    ...(treatment === undefined ? {} : { treatmentId: treatment as import("./types.js").TreatmentId }),
    ...(interventionPath === undefined ? {} : { interventionPath }),
    ...(interventionReviewPath === undefined ? {} : { interventionReviewPath }),
    ...(interventionDesign === undefined ? {} : { interventionDesign }),
    ...(packetSha === undefined ? {} : { expectedPacketFileSha256: packetSha }),
    ...(reviewSha === undefined ? {} : { expectedReviewFileSha256: reviewSha }),
    ...(fixtureSha === undefined ? {} : { expectedTaskFixtureSha256: fixtureSha }),
    ...(repositoryCommit === undefined ? {} : { expectedRepositoryCommit: repositoryCommit }),
    ...(experimentFreezePath === undefined ? {} : { experimentFreezePath }),
    ...(experimentFreezeSha === undefined ? {} : { expectedExperimentFreezeSha256: experimentFreezeSha }),
    ...(minimumReviewers === undefined ? {} : { minimumIndependentReviewers: minimumReviewers })
  });
  process.stdout.write(`${JSON.stringify({ receipt: result.receiptPath, result: result.receipt }, null, 2)}\n`);
  process.exitCode =
    result.receipt.run_status === "completed" && result.receipt.configured_verifier.status === "passed" ? 0 : 1;
}

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) usage();
  return value;
}

main().catch((error: unknown) => {
  const omlError = toOmlError(error);
  process.stderr.write(`${JSON.stringify({ code: omlError.code, message: omlError.message, details: omlError.details })}\n`);
  process.exitCode = 1;
});
