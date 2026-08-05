import assert from 'node:assert/strict';
import test from 'node:test';
import {
  crc32,
  encodeFrame,
  FrameDecoder,
  type DecodeEvent,
  type DecodedFrame,
  type DecoderError
} from '../src/index.ts';

function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;

  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }

  return result;
}

function decodeChunks(
  chunks: readonly Uint8Array[],
  options: ConstructorParameters<typeof FrameDecoder>[0] = {}
): DecodeEvent[] {
  const decoder = new FrameDecoder(options);
  const events: DecodeEvent[] = [];

  for (const chunk of chunks) {
    events.push(...decoder.push(chunk));
  }
  events.push(...decoder.finish());
  return events;
}

function framesFrom(events: readonly DecodeEvent[]): DecodedFrame[] {
  return events.flatMap((event) => event.type === 'frame' ? [event.frame] : []);
}

function errorsFrom(events: readonly DecodeEvent[]): DecoderError[] {
  return events.flatMap((event) => event.type === 'error' ? [event.error] : []);
}

function bytesFrom(start: number, count: number): Uint8Array {
  return Uint8Array.from({ length: count }, (_, index) => (start + index) & 0xff);
}

test('encodes and decodes an empty payload', () => {
  const encoded = encodeFrame(new Uint8Array(0));
  const events = decodeChunks([encoded]);
  const frames = framesFrom(events);

  assert.equal(encoded.byteLength, 14);
  assert.equal(errorsFrom(events).length, 0);
  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.version, 1);
  assert.equal(frames[0]?.flags, 0);
  assert.deepEqual(frames[0]?.payload, new Uint8Array(0));
});

test('round-trips a payload containing every byte from 0 through 255', () => {
  const payload = bytesFrom(0, 256);
  const frames = framesFrom(decodeChunks([encodeFrame(payload)]));

  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0]?.payload, payload);
});

test('decodes input delivered one byte at a time', () => {
  const encoded = encodeFrame(bytesFrom(17, 300), { version: 7, flags: 0xa5 });
  const chunks = Array.from(encoded, (byte) => Uint8Array.of(byte));
  const frames = framesFrom(decodeChunks(chunks));

  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.version, 7);
  assert.equal(frames[0]?.flags, 0xa5);
  assert.deepEqual(frames[0]?.payload, bytesFrom(17, 300));
});

test('does not depend on caller-owned chunk buffers after push', () => {
  const encoded = encodeFrame(Uint8Array.from([9, 8, 7, 6]));
  const decoder = new FrameDecoder();
  const firstChunk = encoded.subarray(0, 12);
  const secondChunk = encoded.subarray(12);
  const events = decoder.push(firstChunk);
  firstChunk.fill(0);
  events.push(...decoder.push(secondChunk));
  events.push(...decoder.finish());

  assert.equal(errorsFrom(events).length, 0);
  assert.deepEqual(framesFrom(events)[0]?.payload, Uint8Array.from([9, 8, 7, 6]));
});

test('decodes multiple frames in one chunk', () => {
  const first = encodeFrame(Uint8Array.from([1, 2, 3]));
  const second = encodeFrame(Uint8Array.from([4, 5]));
  const third = encodeFrame(new Uint8Array(0), { flags: 2 });
  const frames = framesFrom(decodeChunks([concatBytes(first, second, third)]));

  assert.equal(frames.length, 3);
  assert.deepEqual(Array.from(frames[0]?.payload ?? []), [1, 2, 3]);
  assert.deepEqual(Array.from(frames[1]?.payload ?? []), [4, 5]);
  assert.equal(frames[2]?.flags, 2);
});

test('handles arbitrary chunk boundaries', () => {
  const first = encodeFrame(bytesFrom(3, 31));
  const second = encodeFrame(bytesFrom(99, 47), { version: 4, flags: 9 });
  const combined = concatBytes(first, second);
  const boundaries = [1, 2, 5, 10, 11, 18, 27, 43, 58, 71, combined.byteLength];
  const chunks: Uint8Array[] = [];
  let start = 0;

  for (const end of boundaries) {
    chunks.push(combined.subarray(start, end));
    start = end;
  }

  const frames = framesFrom(decodeChunks(chunks));
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[0]?.payload, bytesFrom(3, 31));
  assert.deepEqual(frames[1]?.payload, bytesFrom(99, 47));
});

test('skips garbage before and between valid frames', () => {
  const first = encodeFrame(Uint8Array.from([10, 20]));
  const second = encodeFrame(Uint8Array.from([30, 40, 50]));
  const garbageBefore = Uint8Array.from([0, 1, 2, 3, 0xff, 0x7e]);
  const garbageBetween = Uint8Array.from([0xaa, 0xbb, 0xcc]);
  const events = decodeChunks([concatBytes(garbageBefore, first, garbageBetween, second)]);

  assert.equal(errorsFrom(events).length, 0);
  assert.equal(framesFrom(events).length, 2);
});

test('reports an invalid CRC', () => {
  const encoded = encodeFrame(Uint8Array.from([1, 3, 3, 7]));
  encoded[encoded.byteLength - 1] = (encoded[encoded.byteLength - 1] ?? 0) ^ 0xff;
  const events = decodeChunks([encoded]);
  const errors = errorsFrom(events);

  assert.equal(framesFrom(events).length, 0);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.code, 'invalid-crc');
});

test('reports a truncated header', () => {
  const encoded = encodeFrame(Uint8Array.from([1, 2, 3]));
  const errors = errorsFrom(decodeChunks([encoded.subarray(0, 7)]));

  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.code, 'truncated-header');
  assert.equal(errors[0]?.received, 7);
});

test('reports a truncated payload', () => {
  const encoded = encodeFrame(Uint8Array.from([1, 2, 3, 4, 5]));
  const truncated = encoded.subarray(0, 10 + 3);
  const errors = errorsFrom(decodeChunks([truncated]));

  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.code, 'truncated-payload');
  assert.equal(errors[0]?.received, 3);
  assert.equal(errors[0]?.expected, 5);
});

test('reports a truncated CRC after a complete payload', () => {
  const encoded = encodeFrame(Uint8Array.from([1, 2, 3]));
  const truncated = encoded.subarray(0, 10 + 3 + 2);
  const errors = errorsFrom(decodeChunks([truncated]));

  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.code, 'truncated-crc');
  assert.equal(errors[0]?.received, 2);
  assert.equal(errors[0]?.expected, 4);
});

test('rejects an oversized declared payload without allocating it', () => {
  const oversizedHeader = Uint8Array.from([
    0x46, 0x56, 0x4c, 0x54,
    1, 0,
    0xff, 0xff, 0xff, 0xff
  ]);
  const valid = encodeFrame(Uint8Array.from([8, 9]));
  const events = decodeChunks([concatBytes(oversizedHeader, valid)], { maxPayloadLength: 1024 });
  const errors = errorsFrom(events);
  const frames = framesFrom(events);

  assert.equal(errors[0]?.code, 'oversized-payload');
  assert.equal(errors[0]?.declaredLength, 0xffffffff);
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0]?.payload, Uint8Array.from([8, 9]));
});

test('recovers from a corrupted frame followed by a valid frame', () => {
  const corrupted = encodeFrame(Uint8Array.from([11, 22, 33, 44]));
  corrupted[11] = (corrupted[11] ?? 0) ^ 0x80;
  const valid = encodeFrame(Uint8Array.from([55, 66]));
  const events = decodeChunks([concatBytes(corrupted, valid)]);

  assert.equal(errorsFrom(events)[0]?.code, 'invalid-crc');
  assert.equal(framesFrom(events).length, 1);
  assert.deepEqual(framesFrom(events)[0]?.payload, Uint8Array.from([55, 66]));
});

test('does not resynchronize on a false magic sequence inside a corrupted frame', () => {
  const falseInnerFrame = encodeFrame(Uint8Array.from([0xde, 0xad]));
  const corruptedOuter = encodeFrame(concatBytes(
    Uint8Array.from([0x10, 0x11]),
    falseInnerFrame,
    Uint8Array.from([0x12, 0x13])
  ));
  corruptedOuter[corruptedOuter.byteLength - 1] = (corruptedOuter[corruptedOuter.byteLength - 1] ?? 0) ^ 1;
  const valid = encodeFrame(Uint8Array.from([0xbe, 0xef]));
  const events = decodeChunks([concatBytes(corruptedOuter, valid)]);
  const frames = framesFrom(events);

  assert.equal(errorsFrom(events).length, 1);
  assert.equal(errorsFrom(events)[0]?.code, 'invalid-crc');
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0]?.payload, Uint8Array.from([0xbe, 0xef]));
});

test('produces deterministic encodings and the standard CRC-32 check value', () => {
  const payload = Uint8Array.from(new TextEncoder().encode('deterministic payload'));
  const first = encodeFrame(payload, { version: 2, flags: 0x40 });
  const second = encodeFrame(payload, { version: 2, flags: 0x40 });

  assert.deepEqual(first, second);
  assert.equal(crc32(Uint8Array.from(new TextEncoder().encode('123456789'))), 0xcbf43926);
});
