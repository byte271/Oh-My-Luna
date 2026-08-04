export interface RepositoryDocument {
  path: string;
  content: string;
  recent_history_touches?: number;
}

export interface RankedRepositoryDocument {
  path: string;
  score: number;
  signals: string[];
}

const STOP = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "with"]);

export function rankRepositoryDocuments(
  issue: string,
  documents: RepositoryDocument[],
  observations: { stack_trace?: string } = {}
): RankedRepositoryDocument[] {
  const terms = [...new Set(tokenize(issue).filter((term) => term.length > 1 && !STOP.has(term)))];
  const stackPaths = new Set(extractPaths(observations.stack_trace ?? "").map(normalizePath));
  return documents
    .map((document) => scoreDocument(document, terms, stackPaths))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
}

function scoreDocument(document: RepositoryDocument, terms: string[], stackPaths: Set<string>): RankedRepositoryDocument {
  const path = normalizePath(document.path);
  const pathTokens = tokenize(path);
  const contentTokens = tokenize(document.content);
  const declarations = extractDeclarations(document.content);
  const signals: string[] = [];
  let score = 0;

  const pathHits = terms.filter((term) => pathTokens.includes(term)).length;
  if (pathHits > 0) { score += pathHits * 5; signals.push(`path_terms:${pathHits}`); }
  const contentHits = terms.reduce((sum, term) => sum + Math.min(3, contentTokens.filter((token) => token === term).length), 0);
  if (contentHits > 0) { score += contentHits; signals.push(`content_terms:${contentHits}`); }
  const declarationHits = terms.filter((term) => declarations.has(term)).length;
  if (declarationHits > 0) { score += declarationHits * 4; signals.push(`declared_symbols:${declarationHits}`); }
  if ([...stackPaths].some((candidate) => candidate === path || candidate.endsWith(`/${path}`))) {
    score += 12;
    signals.push("stack_trace_path");
  }
  const testAffinity = testSourceAffinity(path, terms);
  if (testAffinity > 0) { score += testAffinity * 2; signals.push(`test_source_affinity:${testAffinity}`); }
  const touches = Math.max(0, document.recent_history_touches ?? 0);
  if (touches > 0) {
    const historyScore = Math.min(4, Math.log2(touches + 1));
    score += historyScore;
    signals.push(`recent_history:${touches}`);
  }
  return { path: document.path, score: Number(score.toFixed(4)), signals };
}

function tokenize(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter(Boolean);
}

function normalizePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").toLowerCase();
}

function extractPaths(value: string): string[] {
  return value.match(/(?:[A-Za-z]:)?[^\s():]+\.(?:py|tsx?|jsx?|mjs|cjs)/g) ?? [];
}

function extractDeclarations(content: string): Set<string> {
  const declarations = new Set<string>();
  const expression = /\b(?:class|function|def|interface|type|const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  for (const match of content.matchAll(expression)) declarations.add(match[1]!.toLowerCase());
  return declarations;
}

function testSourceAffinity(path: string, issueTerms: string[]): number {
  if (!/(?:^|\/)(?:tests?|__tests__)(?:\/|$)|(?:\.test|\.spec)\./.test(path)) return 0;
  return issueTerms.filter((term) => path.includes(term)).length;
}
