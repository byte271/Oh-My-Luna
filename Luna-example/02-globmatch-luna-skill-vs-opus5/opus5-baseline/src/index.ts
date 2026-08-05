/**
 * GlobMatch — dependency-free glob matching for path strings.
 *
 * Implemented without regular expressions, with matching time bounded by
 * O(|pattern| x |path|) so that untrusted patterns and untrusted paths cannot
 * be combined into a denial of service.
 */
export { GlobError } from './errors.ts';
export { compile, match } from './glob.ts';
export type { CompiledPattern } from './glob.ts';
export { compileSet, matchAny } from './set.ts';
export type { CompiledSet, CompiledSetEntry } from './set.ts';
