/**
 * The entry point that joins relevance to budget.
 *
 * `rankRepositoryDocuments` decides what matters; `compileContext` decides what
 * fits and where it goes. Both existed as libraries with no caller, which is how
 * a repository accumulates code that is never exercised on anything real. This
 * is the one function a caller needs.
 */

import { rankRepositoryDocuments, type RepositoryDocument } from "../repository-ranker.js";
import { compileContext, type CompiledContext, type CompileOptions, type ContextDocument } from "./compile.js";

export interface RepositoryCompileOptions extends CompileOptions {
  readonly observations?: { readonly stack_trace?: string };
}

/**
 * Ranks repository documents against an issue, then compiles them to a budget.
 *
 * Scores are joined back by path over the *original* list rather than taken from
 * the ranker's sorted output, so a repeated path stays repeated and reaches
 * `compileContext`, which reports it as `duplicate_path`. Silently collapsing it
 * here would hide a contradiction the caller needs to fix.
 */
export function compileRepositoryContext(
  issue: string,
  documents: readonly RepositoryDocument[],
  options: RepositoryCompileOptions
): CompiledContext {
  const ranked = rankRepositoryDocuments(issue, [...documents], options.observations ?? {});
  const scores = new Map(ranked.map((entry) => [entry.path, entry.score]));
  const contextDocuments: ContextDocument[] = documents.map((doc) => ({
    path: doc.path,
    content: doc.content,
    score: scores.get(doc.path) ?? 0
  }));
  return compileContext(contextDocuments, options);
}
