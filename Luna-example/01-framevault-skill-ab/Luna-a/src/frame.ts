import { crc32 } from "./crc32.ts";

export const MAGIC = Uint8Array.from([0x46, 0x56, 0x4c, 0x54]);
export const PROTOCOL_VERSION = 1;
export const HEADER_SIZE = 10;
export const CRC_SIZE = 4;
export const FRAME_OVERHEAD = HEADER_SIZE + CRC_SIZE;
export const MAX_UINT32 = 0xffffffff;
export const DEFAULT_MAX_PAYLOAD_LENGTH = 16 * 1024 * 1024;

export interface Frame {
  readonly version: number;
  readonly flags: number;
  readonly payload: Uint8Array;
}

export interface EncodeOptions {
  readonly version?: number;
  readonly flags?: number;
}

function assertByte(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} must be an integer between 0 and 255`);
  }
}

export function readUint32BE(bytes: Uint8Array, offset = 0): number {
  if (!Number.isInteger(offset) || offset < 0 || offset + 4 > bytes.byteLength) {
    throw new RangeError("Cannot read a 32-bit integer beyond the supplied bytes");
  }

  return (
    bytes[offset]! * 0x1000000
    + (bytes[offset + 1]! << 16)
    + (bytes[offset + 2]! << 8)
    + bytes[offset + 3]!
  ) >>> 0;
}

export function writeUint32BE(bytes: Uint8Array, value: number, offset = 0): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new RangeError("The value must be an unsigned 32-bit integer");
  }

  if (!Number.isInteger(offset) || offset < 0 || offset + 4 > bytes.byteLength) {
    throw new RangeError("Cannot write a 32-bit integer beyond the supplied bytes");
  }

  bytes[offset] = Math.floor(value / 0x1000000);
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}

export function encodeFrame(payload: Uint8Array, options?: EncodeOptions): Uint8Array {
  if (!(payload instanceof Uint8Array)) {
    throw new TypeError("The payload must be a Uint8Array");
  }

  if (payload.byteLength > MAX_UINT32) {
    throw new RangeError("The payload is too large for the 32-bit length field");
  }

  const version = options?.version ?? PROTOCOL_VERSION;
  const flags = options?.flags ?? 0;
  assertByte("version", version);
  assertByte("flags", flags);

  const frame = new Uint8Array(FRAME_OVERHEAD + payload.byteLength);
  frame.set(MAGIC, 0);
  frame[4] = version;
  frame[5] = flags;
  writeUint32BE(frame, payload.byteLength, 6);
  frame.set(payload, HEADER_SIZE);

  const checksum = crc32(frame.subarray(0, HEADER_SIZE + payload.byteLength));
  writeUint32BE(frame, checksum, HEADER_SIZE + payload.byteLength);
  return frame;
}

