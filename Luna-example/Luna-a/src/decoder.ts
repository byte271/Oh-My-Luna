import { crc32Chunks } from "./crc32.ts";
import {
  CRC_SIZE,
  DEFAULT_MAX_PAYLOAD_LENGTH,
  FRAME_OVERHEAD,
  HEADER_SIZE,
  MAGIC,
  MAX_UINT32,
  readUint32BE
} from "./frame.ts";
import type { Frame } from "./frame.ts";

export type DecoderErrorCode =
  | "invalid-crc"
  | "oversized-payload"
  | "truncated-header"
  | "truncated-payload"
  | "truncated-crc";

interface FrameDecodeErrorDetails {
  readonly declaredLength?: number;
  readonly maxPayloadLength?: number;
  readonly expectedCrc?: number;
  readonly actualCrc?: number;
  readonly receivedBytes?: number;
  readonly expectedBytes?: number;
}

export class FrameDecodeError extends Error {
  readonly code: DecoderErrorCode;
  readonly declaredLength: number | undefined;
  readonly maxPayloadLength: number | undefined;
  readonly expectedCrc: number | undefined;
  readonly actualCrc: number | undefined;
  readonly receivedBytes: number | undefined;
  readonly expectedBytes: number | undefined;

  constructor(code: DecoderErrorCode, message: string, details: FrameDecodeErrorDetails = {}) {
    super(message);
    this.name = "FrameDecodeError";
    this.code = code;
    this.declaredLength = details.declaredLength;
    this.maxPayloadLength = details.maxPayloadLength;
    this.expectedCrc = details.expectedCrc;
    this.actualCrc = details.actualCrc;
    this.receivedBytes = details.receivedBytes;
    this.expectedBytes = details.expectedBytes;
  }
}

export interface DecoderOptions {
  readonly maxPayloadLength?: number;
}

export interface FrameEvent {
  readonly type: "frame";
  readonly frame: Frame;
}

export interface DecoderErrorEvent {
  readonly type: "error";
  readonly error: FrameDecodeError;
}

export type DecoderEvent = FrameEvent | DecoderErrorEvent;

type CandidateStatus = "pending" | "valid" | "invalid";

interface Candidate {
  readonly start: number;
  length: number | undefined;
  endExclusive: number | undefined;
  status: CandidateStatus;
  error: FrameDecodeError | undefined;
}

const MAGIC_PREFIX_LENGTHS = createPrefixLengths(MAGIC);

function createPrefixLengths(pattern: Uint8Array): number[] {
  const prefixLengths = new Array<number>(pattern.byteLength).fill(0);

  for (let index = 1; index < pattern.byteLength; index += 1) {
    let prefixLength = prefixLengths[index - 1]!;

    while (prefixLength > 0 && pattern[index] !== pattern[prefixLength]) {
      prefixLength = prefixLengths[prefixLength - 1]!;
    }

    if (pattern[index] === pattern[prefixLength]) {
      prefixLength += 1;
    }

    prefixLengths[index] = prefixLength;
  }

  return prefixLengths;
}

function formatCrc(value: number): string {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

function validateMaxPayloadLength(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new RangeError(`maxPayloadLength must be an integer between 0 and ${MAX_UINT32}`);
  }
}

/**
 * Incremental frame decoder.
 *
 * Every magic occurrence is tracked as a candidate without allocating a
 * payload-sized buffer. Candidates are resolved in stream order. After a
 * bad candidate, later candidates can win immediately once their CRC is
 * valid, so false magic bytes cannot permanently swallow a good frame.
 */
export class FrameDecoder {
  readonly maxPayloadLength: number;

  private buffer = new Uint8Array(0);
  private bufferStartOffset = 0;
  private bufferLength = 0;
  private streamOffset = 0;
  private magicMatch = 0;
  private activeCandidates: Candidate[] = [];
  private recoveryMode = false;
  private recoveryFloor: number | undefined;
  private ended = false;

  constructor(options: DecoderOptions = {}) {
    const maxPayloadLength = options.maxPayloadLength ?? DEFAULT_MAX_PAYLOAD_LENGTH;
    validateMaxPayloadLength(maxPayloadLength);
    this.maxPayloadLength = maxPayloadLength;
  }

  push(chunk: Uint8Array): DecoderEvent[] {
    if (this.ended) {
      throw new Error("Cannot push bytes after end() has been called");
    }

    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("Decoder input must be a Uint8Array");
    }

    const events: DecoderEvent[] = [];

    for (let index = 0; index < chunk.byteLength; index += 1) {
      this.appendByte(chunk[index]!, events);
    }

    return events;
  }

  end(): DecoderEvent[] {
    if (this.ended) {
      return [];
    }

    this.ended = true;
    const events: DecoderEvent[] = [];

    while (this.activeCandidates.length > 0) {
      if (this.recoveryMode) {
        const before = this.activeCandidates.length;
        this.resolveRecovery(events);

        if (this.activeCandidates.length === 0) {
          break;
        }

        if (this.activeCandidates.length < before || !this.recoveryMode) {
          continue;
        }

        const first = this.activeCandidates[0]!;
        if (first.status === "pending") {
          events.push({ type: "error", error: this.createTruncationError(first) });
          this.activeCandidates.shift();
          this.activeCandidates = [];
          this.compact(this.streamOffset);
        }

        break;
      }

      this.resolveNormal(events);

      if (this.activeCandidates.length === 0) {
        break;
      }

      const first = this.activeCandidates[0]!;
      if (first.status !== "pending") {
        continue;
      }

      const laterValid = this.activeCandidates.some((candidate) => candidate.status === "valid");
      events.push({ type: "error", error: this.createTruncationError(first) });
      this.activeCandidates.shift();

      if (laterValid) {
        this.recoveryMode = true;
        this.recoveryFloor = first.start;
        this.magicMatch = 0;
        this.resolveRecovery(events);
      } else {
        this.activeCandidates = [];
        this.compact(this.streamOffset);
      }
    }

    this.activeCandidates = [];
    this.compact(this.streamOffset);
    return events;
  }

  private appendByte(byte: number, events: DecoderEvent[]): void {
    this.ensureCapacity(this.bufferLength + 1);
    this.buffer[this.bufferLength] = byte;
    this.bufferLength += 1;
    this.streamOffset += 1;

    this.advanceMagic(byte);
    this.updateCandidateStates(events);
  }

  private advanceMagic(byte: number): void {
    while (this.magicMatch > 0 && byte !== MAGIC[this.magicMatch]!) {
      this.magicMatch = MAGIC_PREFIX_LENGTHS[this.magicMatch - 1]!;
    }

    if (byte === MAGIC[this.magicMatch]!) {
      this.magicMatch += 1;
    } else {
      this.magicMatch = 0;
    }

    if (this.magicMatch === MAGIC.byteLength) {
      this.activeCandidates.push({
        start: this.streamOffset - MAGIC.byteLength,
        length: undefined,
        endExclusive: undefined,
        status: "pending",
        error: undefined
      });
      this.magicMatch = MAGIC_PREFIX_LENGTHS[MAGIC_PREFIX_LENGTHS.length - 1]!;
    }
  }

  private updateCandidateStates(events: DecoderEvent[]): void {
    for (const candidate of this.activeCandidates) {
      if (candidate.status !== "pending") {
        continue;
      }

      if (candidate.length === undefined && this.streamOffset >= candidate.start + HEADER_SIZE) {
        const declaredLength = this.readUint32At(candidate.start + 6);
        candidate.length = declaredLength;
        candidate.endExclusive = candidate.start + FRAME_OVERHEAD + declaredLength;

        if (declaredLength > this.maxPayloadLength) {
          candidate.status = "invalid";
          candidate.endExclusive = undefined;
          candidate.error = new FrameDecodeError(
            "oversized-payload",
            `Declared payload length ${declaredLength} exceeds decoder limit of ${this.maxPayloadLength} bytes`,
            { declaredLength, maxPayloadLength: this.maxPayloadLength }
          );
        }
      }

      if (
        candidate.status === "pending"
        && candidate.length !== undefined
        && candidate.endExclusive !== undefined
        && this.streamOffset >= candidate.endExclusive
      ) {
        const payload = this.bytes(candidate.start + HEADER_SIZE, candidate.start + HEADER_SIZE + candidate.length);
        const header = this.bytes(candidate.start, candidate.start + HEADER_SIZE);
        const expectedCrc = crc32Chunks([header, payload]);
        const actualCrc = this.readUint32At(candidate.endExclusive - CRC_SIZE);

        if (expectedCrc === actualCrc) {
          candidate.status = "valid";
        } else {
          candidate.status = "invalid";
          candidate.error = new FrameDecodeError(
            "invalid-crc",
            `CRC-32 mismatch at byte ${candidate.start}: expected ${formatCrc(expectedCrc)}, received ${formatCrc(actualCrc)}`,
            { expectedCrc, actualCrc }
          );
        }
      }
    }

    this.resolve(events);
  }

  private resolve(events: DecoderEvent[]): void {
    if (this.recoveryMode) {
      this.resolveRecovery(events);
    } else {
      this.resolveNormal(events);
    }
  }

  private resolveNormal(events: DecoderEvent[]): void {
    while (this.activeCandidates.length > 0) {
      const first = this.activeCandidates[0]!;

      if (first.status === "pending") {
        break;
      }

      this.activeCandidates.shift();

      if (first.status === "invalid") {
        if (first.error !== undefined) {
          events.push({ type: "error", error: first.error });
        }

        this.enterRecovery(first);
        this.resolveRecovery(events);
        return;
      }

      this.emitValidCandidate(first, events);
      return;
    }

    this.trimBuffer();
  }

  private resolveRecovery(events: DecoderEvent[]): void {
    this.discardCandidatesBeforeFloor();

    while (this.activeCandidates.length > 0) {
      const first = this.activeCandidates[0]!;

      if (first.status === "pending") {
        const laterValid = this.activeCandidates.find((candidate) => candidate.status === "valid");
        if (laterValid !== undefined) {
          this.emitValidCandidate(laterValid, events);
        }
        return;
      }

      this.activeCandidates.shift();

      if (first.status === "invalid") {
        if (first.error !== undefined) {
          events.push({ type: "error", error: first.error });
        }

        const nextFloor = first.endExclusive ?? this.streamOffset;
        this.recoveryFloor = Math.max(this.recoveryFloor ?? nextFloor, nextFloor);
        this.magicMatch = 0;
        this.discardCandidatesBeforeFloor();
        continue;
      }

      this.emitValidCandidate(first, events);
      return;
    }

    this.trimBuffer();
  }

  private enterRecovery(candidate: Candidate): void {
    this.recoveryMode = true;
    this.recoveryFloor = candidate.endExclusive ?? this.streamOffset;
    this.magicMatch = 0;
    this.discardCandidatesBeforeFloor();
  }

  private discardCandidatesBeforeFloor(): void {
    if (this.recoveryFloor === undefined) {
      return;
    }

    this.activeCandidates = this.activeCandidates.filter(
      (candidate) => candidate.start >= this.recoveryFloor
    );
    this.trimBuffer();
  }

  private emitValidCandidate(candidate: Candidate, events: DecoderEvent[]): void {
    if (candidate.length === undefined || candidate.endExclusive === undefined) {
      throw new Error("Internal decoder error: a valid candidate has no length");
    }

    const payloadBytes = this.bytes(
      candidate.start + HEADER_SIZE,
      candidate.start + HEADER_SIZE + candidate.length
    );
    const payload = new Uint8Array(candidate.length);
    payload.set(payloadBytes);

    events.push({
      type: "frame",
      frame: {
        version: this.byteAt(candidate.start + 4),
        flags: this.byteAt(candidate.start + 5),
        payload
      }
    });

    const frameEnd = candidate.endExclusive;
    this.activeCandidates = this.activeCandidates.filter(
      (other) => other.start >= frameEnd
    );
    this.recoveryMode = false;
    this.recoveryFloor = undefined;
    this.magicMatch = 0;
    this.compact(frameEnd);
  }

  private createTruncationError(candidate: Candidate): FrameDecodeError {
    const received = Math.max(0, this.streamOffset - candidate.start);

    if (candidate.length === undefined) {
      return new FrameDecodeError(
        "truncated-header",
        `Truncated header at byte ${candidate.start}: received ${received} of ${HEADER_SIZE} bytes`,
        { receivedBytes: received, expectedBytes: HEADER_SIZE }
      );
    }

    const payloadReceived = Math.max(0, Math.min(candidate.length, received - HEADER_SIZE));
    if (payloadReceived < candidate.length) {
      return new FrameDecodeError(
        "truncated-payload",
        `Truncated payload at byte ${candidate.start}: received ${payloadReceived} of ${candidate.length} bytes`,
        { declaredLength: candidate.length, receivedBytes: payloadReceived, expectedBytes: candidate.length }
      );
    }

    const crcReceived = Math.max(0, Math.min(CRC_SIZE, received - HEADER_SIZE - candidate.length));
    return new FrameDecodeError(
      "truncated-crc",
      `Truncated CRC at byte ${candidate.start}: received ${crcReceived} of ${CRC_SIZE} bytes`,
      { receivedBytes: crcReceived, expectedBytes: CRC_SIZE }
    );
  }

  private ensureCapacity(requiredLength: number): void {
    if (requiredLength <= this.buffer.byteLength) {
      return;
    }

    const doubledLength = this.buffer.byteLength === 0 ? 256 : this.buffer.byteLength * 2;
    const nextLength = Math.max(requiredLength, doubledLength);
    const nextBuffer = new Uint8Array(nextLength);
    nextBuffer.set(this.buffer.subarray(0, this.bufferLength));
    this.buffer = nextBuffer;
  }

  private trimBuffer(): void {
    const retainFrom = this.activeCandidates.length > 0
      ? this.activeCandidates[0]!.start
      : this.magicMatch > 0
        ? this.streamOffset - this.magicMatch
        : this.streamOffset;
    this.compact(retainFrom);
  }

  private compact(beforeOffset: number): void {
    const targetOffset = Math.max(
      this.bufferStartOffset,
      Math.min(beforeOffset, this.streamOffset)
    );
    const bytesToDrop = targetOffset - this.bufferStartOffset;

    if (bytesToDrop <= 0) {
      return;
    }

    if (bytesToDrop >= this.bufferLength) {
      this.bufferLength = 0;
      this.bufferStartOffset = targetOffset;
      return;
    }

    this.buffer.copyWithin(0, bytesToDrop, this.bufferLength);
    this.bufferLength -= bytesToDrop;
    this.bufferStartOffset = targetOffset;
  }

  private byteAt(offset: number): number {
    const index = offset - this.bufferStartOffset;

    if (index < 0 || index >= this.bufferLength) {
      throw new Error(`Internal decoder error: byte ${offset} is no longer buffered`);
    }

    return this.buffer[index]!;
  }

  private bytes(startOffset: number, endOffset: number): Uint8Array {
    const start = startOffset - this.bufferStartOffset;
    const end = endOffset - this.bufferStartOffset;

    if (start < 0 || end > this.bufferLength || end < start) {
      throw new Error("Internal decoder error: requested bytes are no longer buffered");
    }

    return this.buffer.subarray(start, end);
  }

  private readUint32At(offset: number): number {
    return readUint32BE(this.bytes(offset, offset + 4));
  }
}
