/**
 * Deterministic stand-ins for the model, protocol v2.
 *
 * None of these is a model result, and every receipt they produce is recorded
 * as `capability_evidence: false`.
 *
 * The type signatures carry a protocol rule that v1 stated nowhere and violated
 * everywhere: **a stub must not be better informed than the model it stands in
 * for.** v1's `oracle` and `noop` stubs both ran `git show` to fetch file
 * contents, so they held precisely what the real model lacked. That is how a
 * 20/20 PASS dry run coexisted with a protocol no model could satisfy — the
 * stubs varied the model's *answer* while leaving the *prompt* unexamined.
 *
 * Here the rule is enforced by construction rather than by convention:
 * `UnprivilegedStub` receives the assembled prompt and nothing else. It has no
 * filesystem argument, so it cannot read one. The consequence is that `noop`
 * becomes a live regression test for the v1 defect: it can only reproduce the
 * base file if the prompt actually contains the base file, and if the prompt
 * does not, the dry run fails instead of reporting 20/20.
 *
 * Exactly one stub is privileged. `oracle` must hold the corrected file to
 * prove the apply-and-evaluate path works at all. It is declared privileged,
 * and its passes may never be read as evidence that the prompt is sufficient.
 */

import { parseSourceBlocks, type SourceFile } from "./prompt.js";
import type { StubDeclaration } from "./sufficiency.js";

export interface UnprivilegedStubInput {
  /** The assembled prompt — the stub's only information source. */
  readonly prompt: string;
  readonly permittedPaths: readonly string[];
}

export type UnprivilegedStub = (input: UnprivilegedStubInput) => string;

export type UnprivilegedStubName = "prose" | "noop" | "unseen";

/**
 * A fluent claim of success carrying no applicable change.
 *
 * Must be scored as a failure, not as partial credit. If this stub ever passes,
 * the harness is counting prose as repair.
 */
export const proseStub: UnprivilegedStub = () =>
  "I have reviewed the code and fixed the defect. All tests should now pass.";

/**
 * Returns the base file unchanged, reconstructed from the prompt.
 *
 * Two things are asserted at once: that the apply path handles a well-formed
 * change set, and that the prompt genuinely carries the source. An empty result
 * here is not a stub bug — it is the sufficiency defect, surfacing.
 */
export const noopStub: UnprivilegedStub = ({ prompt, permittedPaths }) => {
  const carried = new Map(parseSourceBlocks(prompt).map((f) => [f.path, f.contents]));
  const files: SourceFile[] = [];
  for (const path of permittedPaths) {
    const contents = carried.get(path);
    if (contents === undefined) {
      // The prompt does not carry this file. Emit the failure honestly rather
      // than reaching around the prompt to disk.
      return JSON.stringify({
        error: "prompt_did_not_contain_source",
        missing_path: path,
        note: "unprivileged stub cannot reproduce a file the prompt omits"
      });
    }
    files.push({ path, contents });
  }
  return JSON.stringify({ files });
};

/**
 * A plausible hallucination: correctly shaped JSON, right paths, invented
 * contents.
 *
 * This is the regression test for the v1 defect. It reproduces what a model
 * that was never shown the source would actually do — answer confidently with
 * a file it made up — and the pipeline must score it as a failure. Under v1
 * every arm would have produced something of this shape, and nothing in the
 * harness would have distinguished it from a genuine attempt.
 */
export const unseenStub: UnprivilegedStub = ({ permittedPaths }) =>
  JSON.stringify({
    files: permittedPaths.map((path) => ({
      path,
      contents:
        `// Reconstructed implementation for ${path}.\n` +
        "// The model was not shown this file and is guessing at its contents.\n" +
        "export function main() {\n  return null;\n}\n"
    }))
  });

export const UNPRIVILEGED_STUBS: Readonly<Record<UnprivilegedStubName, UnprivilegedStub>> = {
  prose: proseStub,
  noop: noopStub,
  unseen: unseenStub
};

export const STUB_DECLARATIONS: readonly Omit<StubDeclaration, "readFromDisk">[] = [
  { name: "prose", privileged: false, purpose: "fluent success claim carrying no change; must be scored a failure" },
  { name: "noop", privileged: false, purpose: "base file reproduced from the prompt; fails if the prompt omits the source" },
  { name: "unseen", privileged: false, purpose: "plausible hallucinated file; regression test for the unseen-source defect" },
  { name: "oracle", privileged: true, purpose: "corrected file from the corrected commit; proves the apply-and-evaluate path only" },
  { name: "mixed", privileged: true, purpose: "composition of noop and oracle; exercises the continuation rule's positive branch" }
];
