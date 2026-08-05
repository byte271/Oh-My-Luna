import { deepStrictEqual, match, ok, strictEqual, throws } from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  DEFAULT_MAX_PAYLOAD_LENGTH,
  FrameDecoder,
  crc32,
  encodeFrame,
  MAGIC
} from "../src/index.ts";
import type { DecoderEvent, Frame } from "../src/index.ts";

const projectDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function concatenate(...chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const result = new Uint8Array(length);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result;
}

function bytes(values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

function frameEvents(events: DecoderEvent[]): Frame[] {
  return events
    .filter((event): event is Extract<DecoderEvent, { type: "frame" }> => event.type === "frame")
    .map((event) => event.frame);
}

function errorEvents(events: DecoderEvent[]): Extract<DecoderEvent, { type: "error" }>["error"][] {
  return events
    .filter((event): event is Extract<DecoderEvent, { type: "error" }> => event.type === "error")
    .map((event) => event.error);
}

function decodeChunks(chunks: Uint8Array[], maxPayloadLength?: number): DecoderEvent[] {
  const decoder = maxPayloadLength === undefined
    ? new FrameDecoder()
    : new FrameDecoder({ maxPayloadLength });
  const events: DecoderEvent[] = [];

  for (const chunk of chunks) {
    events.push(...decoder.push(chunk));
  }

  events.push(...decoder.end());
  return events;
}

test("encodes and decodes an empty payload", () => {
  const encoded = encodeFrame(new Uint8Array(0), { version: 7, flags: 0xa5 });
  const events = decodeChunks([encoded]);
  const [frame] = frameEvents(events);

  ok(frame);
  strictEqual(frame.version, 7);
  strictEqual(frame.flags, 0xa5);
  deepStrictEqual(frame.payload, new Uint8Array(0));
  strictEqual(errorEvents(events).length, 0);
});

test("round-trips a payload containing every byte from 0 through 255", () => {
  const payload = Uint8Array.from({ length: 256 }, (_, index) => index);
  const events = decodeChunks([encodeFrame(payload)]);
  const [frame] = frameEvents(events);

  ok(frame);
  deepStrictEqual(frame.payload, payload);
});

test("decodes a frame when input arrives one byte at a time", () => {
  const encoded = encodeFrame(bytes([1, 2, 3, 4, 5]));
  const decoder = new FrameDecoder();
  const events: DecoderEvent[] = [];

  for (const byte of encoded) {
    events.push(...decoder.push(Uint8Array.of(byte)));
  }
  events.push(...decoder.end());

  deepStrictEqual(frameEvents(events).map((frame) => [...frame.payload]), [[1, 2, 3, 4, 5]]);
  strictEqual(errorEvents(events).length, 0);
});

test("decodes multiple frames in one chunk", () => {
  const first = encodeFrame(bytes([10, 11]));
  const second = encodeFrame(bytes([12, 13, 14]));
  const events = decodeChunks([concatenate(first, second)]);

  deepStrictEqual(
    frameEvents(events).map((frame) => [...frame.payload]),
    [[10, 11], [12, 13, 14]]
  );
});

test("handles arbitrary chunk boundaries", () => {
  const combined = concatenate(
    encodeFrame(bytes([0, 1, 2, 3, 4, 5])),
    encodeFrame(bytes([6, 7, 8, 9]))
  );
  const chunks: Uint8Array[] = [];
  const boundaries = [1, 4, 9, 10, 17, 23, combined.byteLength];
  let start = 0;

  for (const end of boundaries) {
    chunks.push(combined.subarray(start, end));
    start = end;
  }

  const events = decodeChunks(chunks);
  deepStrictEqual(
    frameEvents(events).map((frame) => [...frame.payload]),
    [[0, 1, 2, 3, 4, 5], [6, 7, 8, 9]]
  );
});

test("ignores garbage before and between valid frames", () => {
  const first = encodeFrame(bytes([0xaa]));
  const second = encodeFrame(bytes([0xbb, 0xcc]));
  const garbageBefore = bytes([0x00, 0xff, 0x46, 0x00, 0x12]);
  const garbageBetween = bytes([0x99, 0x46, 0x56, 0x00, 0x88, 0x77]);
  const events = decodeChunks([concatenate(garbageBefore, first, garbageBetween, second)]);

  deepStrictEqual(
    frameEvents(events).map((frame) => [...frame.payload]),
    [[0xaa], [0xbb, 0xcc]]
  );
});

test("reports an invalid CRC", () => {
  const corrupted = encodeFrame(bytes([1, 2, 3]));
  corrupted[corrupted.byteLength - 1] ^= 0x01;
  const events = decodeChunks([corrupted]);
  const [error] = errorEvents(events);

  strictEqual(error?.code, "invalid-crc");
  match(error?.message ?? "", /CRC-32 mismatch/);
  strictEqual(frameEvents(events).length, 0);
});

test("reports a truncated header", () => {
  const truncated = concatenate(MAGIC, bytes([1, 0]));
  const errors = errorEvents(decodeChunks([truncated]));

  strictEqual(errors.length, 1);
  strictEqual(errors[0]?.code, "truncated-header");
});

test("reports a truncated payload", () => {
  const encoded = encodeFrame(bytes([1, 2, 3, 4]));
  const truncated = encoded.subarray(0, 10 + 2);
  const errors = errorEvents(decodeChunks([truncated]));

  strictEqual(errors.length, 1);
  strictEqual(errors[0]?.code, "truncated-payload");
});

test("rejects an oversized declared payload without allocating it", () => {
  const oversizedHeader = concatenate(
    MAGIC,
    bytes([1, 0, 0xff, 0xff, 0xff, 0xff])
  );
  const valid = encodeFrame(bytes([8, 9]));
  const events = decodeChunks([concatenate(oversizedHeader, valid)], 32);
  const errors = errorEvents(events);

  strictEqual(errors.length, 1);
  strictEqual(errors[0]?.code, "oversized-payload");
  deepStrictEqual(frameEvents(events).map((frame) => [...frame.payload]), [[8, 9]]);
});

test("recovers a valid frame after a corrupted frame", () => {
  const corrupted = encodeFrame(bytes([0x10, 0x20, 0x30]));
  corrupted[11] ^= 0xff;
  const valid = encodeFrame(bytes([0x40, 0x50]));
  const events = decodeChunks([concatenate(corrupted, valid)]);

  strictEqual(errorEvents(events).some((error) => error.code === "invalid-crc"), true);
  deepStrictEqual(frameEvents(events).map((frame) => [...frame.payload]), [[0x40, 0x50]]);
});

test("ignores false magic sequences inside corrupted data during recovery", () => {
  const payload = concatenate(
    bytes([0x01, 0x02]),
    MAGIC,
    bytes([0xff, 0x00, 0x12, 0x34, 0x56, 0x78]),
    bytes([0x03, 0x04])
  );
  const corrupted = encodeFrame(payload);
  corrupted[corrupted.byteLength - 2] ^= 0x80;
  const valid = encodeFrame(bytes([0xde, 0xad, 0xbe, 0xef]));
  const events = decodeChunks([concatenate(corrupted, valid)]);

  strictEqual(errorEvents(events).some((error) => error.code === "invalid-crc"), true);
  deepStrictEqual(frameEvents(events).map((frame) => [...frame.payload]), [[0xde, 0xad, 0xbe, 0xef]]);
});

test("produces deterministic encoding and the standard CRC-32 check value", () => {
  strictEqual(crc32(bytes([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39])), 0xcbf43926);

  const first = encodeFrame(bytes([0x01, 0x02, 0x03]), { version: 2, flags: 0x10 });
  const second = encodeFrame(bytes([0x01, 0x02, 0x03]), { version: 2, flags: 0x10 });
  deepStrictEqual(first, second);
  strictEqual(Buffer.from(first).toString("hex"), "46564c5402100000000301020347f2b54e");
});

test("validates decoder limits and end-of-stream behavior", () => {
  strictEqual(new FrameDecoder().maxPayloadLength, DEFAULT_MAX_PAYLOAD_LENGTH);
  throws(() => new FrameDecoder({ maxPayloadLength: -1 }), /maxPayloadLength/);
  throws(() => new FrameDecoder({ maxPayloadLength: 0x100000000 }), /maxPayloadLength/);

  const decoder = new FrameDecoder();
  decoder.end();
  throws(() => decoder.push(new Uint8Array(0)), /after end/);
});

test("CLI encodes a file and decodes valid frames while reporting corruption", async () => {
  const directory = await mkdtemp(join(tmpdir(), "framevault-test-"));
  const inputPath = join(directory, "payload.bin");
  const encodedPath = join(directory, "encoded.bin");
  const streamPath = join(directory, "stream.bin");
  const outputDirectory = join(directory, "decoded");

  try {
    const payload = bytes([0x00, 0x7f, 0xff, 0x01]);
    await writeFile(inputPath, payload);
    const encodeResult = spawnSync(process.execPath, ["--experimental-strip-types", "src/cli.ts", "encode", inputPath, encodedPath], {
      cwd: projectDirectory,
      encoding: "utf8"
    });
    strictEqual(encodeResult.status, 0, encodeResult.stderr);

    const encoded = new Uint8Array(await readFile(encodedPath));
    const corrupted = encoded.slice();
    corrupted[corrupted.byteLength - 1] ^= 0x01;
    await writeFile(streamPath, concatenate(corrupted, encoded));

    const decodeResult = spawnSync(process.execPath, ["--experimental-strip-types", "src/cli.ts", "decode", streamPath, outputDirectory], {
      cwd: projectDirectory,
      encoding: "utf8"
    });
    strictEqual(decodeResult.status, 1);
    match(decodeResult.stderr, /CRC-32 mismatch/);
    match(decodeResult.stdout, /decoded frame-000001\.bin/);

    const decodedPayload = new Uint8Array(await readFile(join(outputDirectory, "frame-000001.bin")));
    deepStrictEqual(decodedPayload, payload);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
