/**
 * Error thrown for a malformed pattern.
 *
 * Every `GlobError` is raised while *compiling* a pattern, never while
 * matching a path. That guarantee is what lets callers validate untrusted
 * patterns once, up front, and then match without a try/catch in the hot loop.
 */
export class GlobError extends Error {
  /** The pattern that failed to compile. */
  readonly pattern: string;
  /** Offset into the pattern, counted in Unicode code points. */
  readonly index: number;

  constructor(reason: string, pattern: string, index: number) {
    super(`${reason} at offset ${index} in pattern ${JSON.stringify(pattern)}`);
    this.name = 'GlobError';
    this.pattern = pattern;
    this.index = index;
  }
}
