declare const console: {
  log(...values: unknown[]): void;
  error(...values: unknown[]): void;
};

declare const process: {
  readonly argv: string[];
  readonly env: Record<string, string | undefined>;
  readonly execPath: string;
  exitCode: number | undefined;
  cwd(): string;
  stdout: { write(value: string): void };
  stderr: { write(value: string): void };
};

declare const Buffer: {
  from(value: Uint8Array): { toString(encoding: "hex"): string };
};

declare module "node:assert/strict" {
  export function deepStrictEqual(actual: unknown, expected: unknown, message?: string): void;
  export function strictEqual(actual: unknown, expected: unknown, message?: string): void;
  export function ok(value: unknown, message?: string): asserts value;
  export function match(value: string, regexp: RegExp, message?: string): void;
  export function throws(block: () => unknown, error?: RegExp | ((error: unknown) => boolean)): void;
}

declare module "node:child_process" {
  export interface SpawnSyncResult {
    readonly status: number | null;
    readonly stdout: string;
    readonly stderr: string;
    readonly error: Error | undefined;
  }

  export function spawnSync(
    command: string,
    args?: readonly string[],
    options?: { readonly cwd?: string; readonly encoding?: "utf8" }
  ): SpawnSyncResult;
}

declare module "node:fs" {
  export function createReadStream(path: string): AsyncIterable<Uint8Array>;
}

declare module "node:fs/promises" {
  export function mkdir(path: string, options?: { readonly recursive?: boolean }): Promise<void>;
  export function mkdtemp(prefix: string): Promise<string>;
  export function readFile(path: string): Promise<Uint8Array>;
  export function rm(path: string, options?: { readonly force?: boolean; readonly recursive?: boolean }): Promise<void>;
  export function writeFile(path: string, data: Uint8Array | string): Promise<void>;
}

declare module "node:os" {
  export function tmpdir(): string;
}

declare module "node:path" {
  export function dirname(path: string): string;
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module "node:url" {
  export function fileURLToPath(url: string | object): string;
}
