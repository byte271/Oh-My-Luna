import {
  CRC_LENGTH,
  DEFAULT_PROTOCOL_VERSION,
  HEADER_LENGTH,
  MAGIC_BYTES,
  MAX_UINT32
} from './constants.ts';
import { crc32 } from './crc32.ts';

export interface EncodeOptions {
  readonly version?: number;
  readonly flags?: number;
}

function validateByte(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} must be an integer from 0 through 255.`);
  }
}

function writeUint32BigEndian(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

export function encodeFrame(payload: Uint8Array, options: EncodeOptions = {}): Uint8Array {
  if (!(payload instanceof Uint8Array)) {
    throw new TypeError('payload must be a Uint8Array.');
  }

  const version = options.version ?? DEFAULT_PROTOCOL_VERSION;
  const flags = options.flags ?? 0;
  validateByte('version', version);
  validateByte('flags', flags);

  const payloadLength = payload.byteLength;
  if (payloadLength > MAX_UINT32 - HEADER_LENGTH - CRC_LENGTH) {
    throw new RangeError('payload is too large for the FrameVault format.');
  }

  const frame = new Uint8Array(HEADER_LENGTH + payloadLength + CRC_LENGTH);
  frame.set(MAGIC_BYTES, 0);
  frame[4] = version;
  frame[5] = flags;
  writeUint32BigEndian(frame, 6, payloadLength);
  frame.set(payload, HEADER_LENGTH);

  const checksum = crc32(frame.subarray(0, HEADER_LENGTH + payloadLength));
  writeUint32BigEndian(frame, HEADER_LENGTH + payloadLength, checksum);
  return frame;
}
