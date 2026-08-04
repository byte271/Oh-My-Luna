import {
  CRC_LENGTH,
  DEFAULT_MAX_PAYLOAD_LENGTH,
  HEADER_LENGTH,
  MAGIC_BYTES,
  MAX_UINT32
} from './constants.ts';
import {
  CRC32_INITIAL,
  finalizeCrc32,
  updateCrc32
} from './crc32.ts';

export interface DecodedFrame {
  readonly version: number;
  readonly flags: number;
  readonly payload: Uint8Array;
  readonly offset: number;
}

export type DecoderErrorCode =
  | 'oversized-payload'
  | 'invalid-crc'
  | 'truncated-header'
  | 'truncated-payload'
  | 'truncated-crc';

export interface DecoderError {
  readonly code: DecoderErrorCode;
  readonly message: string;
  readonly offset: number;
  readonly declaredLength?: number;
  readonly maxPayloadLength?: number;
  readonly expected?: number;
  readonly received?: number;
  readonly expectedCrc?: number;
  readonly actualCrc?: number;
}

export type DecodeEvent =
  | { readonly type: 'frame'; readonly frame: DecodedFrame }
  | { readonly type: 'error'; readonly error: DecoderError };

export interface FrameDecoderOptions {
  readonly maxPayloadLength?: number;
}

type DecoderState = 'search' | 'header' | 'body';

function readUint32BigEndian(source: Uint8Array, offset: number): number {
  const first = source[offset] ?? 0;
  const second = source[offset + 1] ?? 0;
  const third = source[offset + 2] ?? 0;
  const fourth = source[offset + 3] ?? 0;
  return ((first * 0x1000000) + (second << 16) + (third << 8) + fourth) >>> 0;
}

function validatePayloadLimit(limit: number): void {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_UINT32) {
    throw new RangeError(`maxPayloadLength must be an integer from 0 through ${MAX_UINT32}.`);
  }
}

function copyChunks(chunks: readonly Uint8Array[], length: number): Uint8Array {
  if (chunks.length === 1 && chunks[0]?.byteLength === length) {
    return chunks[0];
  }

  const payload = new Uint8Array(length);
  let destinationOffset = 0;

  for (const chunk of chunks) {
    payload.set(chunk, destinationOffset);
    destinationOffset += chunk.byteLength;
  }

  return payload;
}

export class FrameDecoder {
  private readonly maxPayloadLength: number;
  private state: DecoderState = 'search';
  private magicMatched = 0;
  private readonly header = new Uint8Array(HEADER_LENGTH);
  private headerBytesRead = 0;
  private candidateOffset = 0;
  private version = 0;
  private flags = 0;
  private payloadLength = 0;
  private payloadRemaining = 0;
  private payloadBytes = 0;
  private payloadChunks: Uint8Array[] = [];
  private crcState = CRC32_INITIAL;
  private readonly expectedCrcBytes = new Uint8Array(CRC_LENGTH);
  private expectedCrcBytesRead = 0;
  private totalBytesSeen = 0;
  private finished = false;

  public constructor(options: FrameDecoderOptions = {}) {
    const maxPayloadLength = options.maxPayloadLength ?? DEFAULT_MAX_PAYLOAD_LENGTH;
    validatePayloadLimit(maxPayloadLength);
    this.maxPayloadLength = maxPayloadLength;
  }

  public push(chunk: Uint8Array): DecodeEvent[] {
    if (this.finished) {
      throw new Error('cannot push data after finish() has been called.');
    }
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError('decoder input must be a Uint8Array.');
    }

    const events: DecodeEvent[] = [];
    let inputOffset = 0;

    while (inputOffset < chunk.byteLength) {
      if (this.state === 'search') {
        const byteOffset = this.totalBytesSeen;
        const byte = chunk[inputOffset] ?? 0;
        inputOffset += 1;
        this.totalBytesSeen += 1;
        this.consumeSearchByte(byte, byteOffset);
        continue;
      }

      if (this.state === 'header') {
        const bytesToCopy = Math.min(
          HEADER_LENGTH - this.headerBytesRead,
          chunk.byteLength - inputOffset
        );
        this.header.set(
          chunk.subarray(inputOffset, inputOffset + bytesToCopy),
          this.headerBytesRead
        );
        inputOffset += bytesToCopy;
        this.totalBytesSeen += bytesToCopy;
        this.headerBytesRead += bytesToCopy;

        if (this.headerBytesRead === HEADER_LENGTH) {
          this.beginBody(events);
        }
        continue;
      }

      if (this.payloadRemaining > 0) {
        const bytesToCopy = Math.min(
          this.payloadRemaining,
          chunk.byteLength - inputOffset
        );
        const payloadPart = chunk.subarray(inputOffset, inputOffset + bytesToCopy);
        this.payloadChunks.push(new Uint8Array(payloadPart));
        this.payloadBytes += bytesToCopy;
        this.payloadRemaining -= bytesToCopy;
        this.crcState = updateCrc32(this.crcState, payloadPart);
        inputOffset += bytesToCopy;
        this.totalBytesSeen += bytesToCopy;
        continue;
      }

      const bytesToCopy = Math.min(
        CRC_LENGTH - this.expectedCrcBytesRead,
        chunk.byteLength - inputOffset
      );
      this.expectedCrcBytes.set(
        chunk.subarray(inputOffset, inputOffset + bytesToCopy),
        this.expectedCrcBytesRead
      );
      inputOffset += bytesToCopy;
      this.totalBytesSeen += bytesToCopy;
      this.expectedCrcBytesRead += bytesToCopy;

      if (this.expectedCrcBytesRead === CRC_LENGTH) {
        this.completeBody(events);
      }
    }

    return events;
  }

  public finish(): DecodeEvent[] {
    if (this.finished) {
      return [];
    }

    this.finished = true;
    const events: DecodeEvent[] = [];

    if (this.state === 'header') {
      events.push({
        type: 'error',
        error: {
          code: 'truncated-header',
          message: `Truncated frame header at byte ${this.candidateOffset}: received ${this.headerBytesRead} of ${HEADER_LENGTH} bytes.`,
          offset: this.candidateOffset,
          expected: HEADER_LENGTH,
          received: this.headerBytesRead
        }
      });
    } else if (this.state === 'body' && this.payloadRemaining > 0) {
      events.push({
        type: 'error',
        error: {
          code: 'truncated-payload',
          message: `Truncated payload at byte ${this.candidateOffset}: received ${this.payloadBytes} of ${this.payloadLength} bytes.`,
          offset: this.candidateOffset,
          expected: this.payloadLength,
          received: this.payloadBytes
        }
      });
    } else if (this.state === 'body') {
      events.push({
        type: 'error',
        error: {
          code: 'truncated-crc',
          message: `Truncated CRC at byte ${this.candidateOffset}: received ${this.expectedCrcBytesRead} of ${CRC_LENGTH} bytes.`,
          offset: this.candidateOffset,
          expected: CRC_LENGTH,
          received: this.expectedCrcBytesRead
        }
      });
    }

    return events;
  }

  private consumeSearchByte(byte: number, byteOffset: number): void {
    const expectedByte = MAGIC_BYTES[this.magicMatched] ?? -1;

    if (byte === expectedByte) {
      this.magicMatched += 1;

      if (this.magicMatched === MAGIC_BYTES.byteLength) {
        this.state = 'header';
        this.header.set(MAGIC_BYTES, 0);
        this.headerBytesRead = MAGIC_BYTES.byteLength;
        this.candidateOffset = byteOffset - MAGIC_BYTES.byteLength + 1;
        this.magicMatched = 0;
      }
      return;
    }

    this.magicMatched = byte === (MAGIC_BYTES[0] ?? -1) ? 1 : 0;
  }

  private beginBody(events: DecodeEvent[]): void {
    this.version = this.header[4] ?? 0;
    this.flags = this.header[5] ?? 0;
    this.payloadLength = readUint32BigEndian(this.header, 6);

    if (this.payloadLength > this.maxPayloadLength) {
      events.push({
        type: 'error',
        error: {
          code: 'oversized-payload',
          message: `Rejected frame at byte ${this.candidateOffset}: declared payload length ${this.payloadLength} exceeds the configured limit of ${this.maxPayloadLength}.`,
          offset: this.candidateOffset,
          declaredLength: this.payloadLength,
          maxPayloadLength: this.maxPayloadLength
        }
      });
      this.resetSearch();
      return;
    }

    this.state = 'body';
    this.payloadRemaining = this.payloadLength;
    this.payloadBytes = 0;
    this.payloadChunks = [];
    this.crcState = updateCrc32(CRC32_INITIAL, this.header);
    this.expectedCrcBytes.fill(0);
    this.expectedCrcBytesRead = 0;
  }

  private completeBody(events: DecodeEvent[]): void {
    const actualCrc = finalizeCrc32(this.crcState);
    const expectedCrc = readUint32BigEndian(this.expectedCrcBytes, 0);

    if (actualCrc !== expectedCrc) {
      events.push({
        type: 'error',
        error: {
          code: 'invalid-crc',
          message: `Invalid CRC for frame at byte ${this.candidateOffset}: expected 0x${expectedCrc.toString(16).padStart(8, '0')}, calculated 0x${actualCrc.toString(16).padStart(8, '0')}.`,
          offset: this.candidateOffset,
          expectedCrc,
          actualCrc
        }
      });
      this.resetSearch();
      return;
    }

    events.push({
      type: 'frame',
      frame: {
        version: this.version,
        flags: this.flags,
        payload: copyChunks(this.payloadChunks, this.payloadLength),
        offset: this.candidateOffset
      }
    });
    this.resetSearch();
  }

  private resetSearch(): void {
    this.state = 'search';
    this.magicMatched = 0;
    this.headerBytesRead = 0;
    this.payloadLength = 0;
    this.payloadRemaining = 0;
    this.payloadBytes = 0;
    this.payloadChunks = [];
    this.expectedCrcBytesRead = 0;
  }
}
