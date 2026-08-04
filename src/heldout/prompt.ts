/**
 * Stage A prompt assembly, protocol v2.
 *
 * This module exists because prompt assembly was previously duplicated: once in
 * `scripts/gate-h-heldout/run-stage-a.mjs` and once in
 * `check-prompt-completeness.mjs`, whose own comment warned that "if that
 * function changes, this check must be updated with it, or it silently stops
 * measuring reality." A sufficiency check that can drift from the thing it
 * measures is not a check. Both callers now import from here, and
 * `tests/heldout-prompt.test.ts` asserts the identity holds.
 *
 * Two correctness properties this module is responsible for:
 *
 * 1. **No `$`-pattern corruption.** `String.prototype.replace` with a string
 *    pattern interprets `$&`, `` $` ``, `$'`, `$1`…`$99` and `$$` in the
 *    *replacement*. v1 assembled prompts with `.replace("{{ISSUE}}", issue)`,
 *    which silently rewrites the prompt whenever the substituted text contains
 *    one of those sequences. The v1 corpus happens to contain no `$` in any
 *    issue file, so the bug never fired — but protocol v2 substitutes *source
 *    code*, where `$&` and `$1` are ordinary (regex replacement calls, shell
 *    strings, template literals). The corrupted prompt would then be hashed
 *    into `prompt_sha256` as though it were intended.
 *
 * 2. **No second-pass injection.** Sequential `.replace()` calls let a value
 *    substituted in pass 1 be scanned for placeholders in pass 2, so source
 *    containing the literal `{{ASSISTANCE}}` would have assistance metadata
 *    spliced into it. Substitution here is single-pass: every placeholder is
 *    replaced simultaneously and substituted text is never rescanned.
 */

/** A source file supplied to the model at the task's base commit. */
export interface SourceFile {
  readonly path: string;
  readonly contents: string;
}

export interface PromptInputs {
  /** Issue text as shown to every arm. */
  readonly issue: string;
  /**
   * Complete contents of every permitted path at the base commit. Protocol v2
   * supplies these to *every* arm including T0, so the arms differ only in
   * assistance metadata.
   */
  readonly sources: readonly SourceFile[];
  /** Arm-specific assistance block; empty string for T0. */
  readonly assistance: string;
}

export const PLACEHOLDER_PATTERN = /\{\{(ISSUE|SOURCE|ASSISTANCE)\}\}/g;

export type PlaceholderName = "ISSUE" | "SOURCE" | "ASSISTANCE";

/**
 * Substitutes every placeholder in one pass.
 *
 * Uses a function replacer, which — unlike a string replacement — receives the
 * value verbatim and performs no `$`-pattern expansion. Text introduced by a
 * substitution is never rescanned for further placeholders.
 */
export function fillTemplate(template: string, values: Readonly<Record<PlaceholderName, string>>): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, name: string) => values[name as PlaceholderName]);
}

/** Placeholders the template actually contains, in first-appearance order. */
export function templatePlaceholders(template: string): PlaceholderName[] {
  const seen = new Set<PlaceholderName>();
  for (const match of template.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1] as PlaceholderName | undefined;
    if (name !== undefined) seen.add(name);
  }
  return [...seen];
}

/**
 * Renders the `{{SOURCE}}` block: one path-labelled fenced region per permitted
 * file, in the order the task declares them.
 *
 * The label is repeated on the closing line so a truncated prompt is detectable
 * rather than silently short.
 */
export function renderSourceBlock(sources: readonly SourceFile[]): string {
  if (sources.length === 0) return "";
  return sources
    .map((file) => `<file path="${file.path}">\n${file.contents}\n</file path="${file.path}">`)
    .join("\n");
}

/**
 * Assembles the task prompt. The single definition used by the runner, the
 * completeness check, and the cost forecaster.
 */
export function buildTaskPrompt(template: string, inputs: PromptInputs): string {
  return fillTemplate(template, {
    ISSUE: inputs.issue.trim(),
    SOURCE: renderSourceBlock(inputs.sources),
    ASSISTANCE: inputs.assistance
  });
}

/**
 * Recovers the source files a prompt carries.
 *
 * The inverse of `renderSourceBlock`, and the reason the unprivileged stubs can
 * work from the prompt alone. If the prompt omits the source this returns an
 * empty list, which is what makes the `noop` stub a regression test for the v1
 * defect rather than a restatement of it: a stub that cannot find the file in
 * its prompt cannot reproduce the file, and the dry run goes red.
 */
export function parseSourceBlocks(prompt: string): SourceFile[] {
  const files: SourceFile[] = [];
  const opener = /<file path="([^"]*)">\n/g;
  for (;;) {
    const open = opener.exec(prompt);
    if (open === null) break;
    const path = open[1];
    if (path === undefined) continue;
    const closer = `\n</file path="${path}">`;
    const end = prompt.indexOf(closer, opener.lastIndex);
    if (end === -1) continue;
    files.push({ path, contents: prompt.slice(opener.lastIndex, end) });
    opener.lastIndex = end + closer.length;
  }
  return files;
}

/**
 * Renders the assistance block for an assisted arm.
 *
 * T0 receives an empty string, not an empty `<assistance>` element: an empty
 * element is itself a signal that assistance exists, which would make T0 a
 * different prompt shape rather than the same prompt minus metadata.
 */
export function renderAssistance(payload: unknown): string {
  return `\n<assistance>\n${JSON.stringify(payload, null, 2)}\n</assistance>\n`;
}
