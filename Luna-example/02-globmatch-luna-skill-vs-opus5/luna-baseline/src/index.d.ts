export declare class GlobPatternError extends Error {
  readonly code: "ERR_GLOB_PATTERN";
  constructor(message: string);
}

export declare class CompiledPattern {
  readonly pattern: string;
  test(path: string): boolean;
}

export declare function compile(pattern: string): CompiledPattern;
export declare function match(pattern: string, path: string): boolean;
export declare function matchAny(patterns: readonly string[], path: string): number;
