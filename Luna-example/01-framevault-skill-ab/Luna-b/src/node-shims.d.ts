declare const console: {
  error(...data: readonly unknown[]): void;
  log(...data: readonly unknown[]): void;
};

declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare module 'node:assert/strict' {
  interface Assert {
    equal(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    throws(block: () => unknown, error?: unknown): void;
  }

  const assert: Assert;
  export default assert;
}

declare module 'node:fs' {
  interface ReadStream extends AsyncIterable<Uint8Array> {}
  export function createReadStream(
    path: string,
    options?: { readonly highWaterMark?: number }
  ): ReadStream;
}

declare module 'node:fs/promises' {
  export function mkdir(
    path: string,
    options?: { readonly recursive?: boolean }
  ): Promise<string | undefined>;
  export function readFile(path: string): Promise<Uint8Array>;
  export function writeFile(path: string, data: Uint8Array): Promise<void>;
}

declare module 'node:path' {
  export function join(...paths: readonly string[]): string;
}

declare module 'node:process' {
  interface Process {
    readonly argv: string[];
    exitCode?: number;
  }

  const process: Process;
  export default process;
}

declare module 'node:test' {
  type TestFunction = () => void | Promise<void>;
  const test: (name: string, fn: TestFunction) => void;
  export default test;
}
