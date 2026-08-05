declare module "node:fs" {
  export function readFileSync(
    path: string,
    encoding: "utf8",
  ): string;
}

declare module "node:test" {
  type TestFunction = () => void | Promise<void>;
  export function test(name: string, callback: TestFunction): void;
  export default test;
}

declare module "node:assert/strict" {
  interface Assert {
    equal(actual: unknown, expected: unknown, message?: string): void;
    strictEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
    throws(block: () => unknown, error?: unknown): void;
    doesNotThrow(block: () => unknown, message?: string): void;
  }

  const assert: Assert;
  export default assert;
}

interface GlobMatchStdin extends AsyncIterable<string> {
  setEncoding(encoding: "utf8"): void;
}

interface GlobMatchStream {
  write(value: string): boolean;
}

declare const process: {
  readonly argv: readonly string[];
  readonly stdin: GlobMatchStdin;
  readonly stdout: GlobMatchStream;
  readonly stderr: GlobMatchStream;
  exitCode: number;
};
