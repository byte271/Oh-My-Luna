/**
 * Minimal ambient declarations for the Node.js built-ins this project uses.
 *
 * The project ships with no dependencies, so `@types/node` is not installed.
 * Rather than loosen type checking, we declare exactly the surface the CLI and
 * the tests touch. The library itself (`src/index.ts` and everything it
 * imports) uses no Node APIs at all and needs none of this.
 *
 * These declarations are intentionally narrow: if the CLI starts using an API
 * that is not declared here, the type check fails rather than silently
 * accepting `any`.
 */

declare module 'node:process' {
  interface WritableStreamLike {
    write(chunk: string): boolean;
    on(event: 'error', listener: (error: unknown) => void): void;
  }

  interface ReadableStreamLike extends AsyncIterable<string> {
    setEncoding(encoding: string): void;
    readonly isTTY?: boolean;
  }

  interface Process {
    readonly argv: readonly string[];
    readonly execPath: string;
    readonly stdin: ReadableStreamLike;
    readonly stdout: WritableStreamLike;
    readonly stderr: WritableStreamLike;
    exitCode: number | undefined;
  }

  const process: Process;
  export default process;
}

declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readdirSync(path: string): string[];
  export function writeFileSync(path: string, data: string, encoding: 'utf8'): void;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options: { recursive: boolean; force: boolean }): void;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(path: string): string;
  export function resolve(...parts: string[]): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string): string;
}

declare module 'node:child_process' {
  export interface SpawnSyncResult {
    readonly status: number | null;
    readonly signal: string | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly error?: Error;
  }

  export interface SpawnSyncOptions {
    readonly encoding: 'utf8';
    readonly input?: string;
  }

  export function spawnSync(
    command: string,
    args: readonly string[],
    options: SpawnSyncOptions,
  ): SpawnSyncResult;
}

declare module 'node:test' {
  export type TestFn = () => void | Promise<void>;
  export function test(name: string, fn: TestFn): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: TestFn): void;
}

declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(block: () => unknown, expected?: unknown, message?: string): void;
    doesNotThrow(block: () => unknown, message?: string): void;
    fail(message?: string): never;
  }

  const assert: Assert;
  export default assert;
}

/**
 * `import.meta.url` is provided by the ES module host. TypeScript only ships
 * the `url` property with the DOM or `@types/node` libraries, neither of which
 * this project uses, so it is declared here.
 */
interface ImportMeta {
  readonly url: string;
}
