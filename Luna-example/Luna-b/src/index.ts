export {
  CRC_LENGTH,
  DEFAULT_MAX_PAYLOAD_LENGTH,
  DEFAULT_PROTOCOL_VERSION,
  HEADER_LENGTH,
  MAGIC,
  MAX_UINT32
} from './constants.ts';
export { crc32 } from './crc32.ts';
export { encodeFrame } from './encoder.ts';
export type { EncodeOptions } from './encoder.ts';
export { FrameDecoder } from './decoder.ts';
export type {
  DecodeEvent,
  DecodedFrame,
  DecoderError,
  DecoderErrorCode,
  FrameDecoderOptions
} from './decoder.ts';
