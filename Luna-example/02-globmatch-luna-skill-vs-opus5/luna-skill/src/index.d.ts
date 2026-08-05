export declare class GlobPatternError extends Error {
  readonly pattern: string;
  readonly position: number;
  constructor(pattern: string, message: string, position: number);
}

export interface CompiledMatcher {
  readonly pattern: string;
  match(path: string): boolean;
  test(path: string): boolean;
}

export interface CompiledPatternSet {
  match(path: string): number;
}

export declare function compile(pattern: string): CompiledMatcher;
export declare function match(pattern: string, path: string): boolean;
export declare function compileAny(
  patterns: readonly string[],
): CompiledPatternSet;
export declare function matchAny(
  patterns: readonly string[],
  path: string,
): number;
