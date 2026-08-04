# FrameVault

FrameVault is a dependency-free TypeScript library and Node.js CLI for encoding and decoding binary data frames.

## Frame format

Every frame is encoded in network byte order:

| Bytes | Field |
| ---: | --- |
| 4 | Magic value `FVLT` |
| 1 | Protocol version |
| 1 | Flags |
| 4 | Unsigned payload length, big-endian |
| N | Payload |
| 4 | CRC-32 of every preceding byte in the frame |

The encoder defaults to protocol version `1` and flags `0`. The decoder accepts any one-byte version and flags value because version negotiation is outside this framing layer.

## Architecture and safety

- `encodeFrame` builds a complete frame and computes CRC-32 internally with a generated lookup table.
- `FrameDecoder` is an incremental state machine. It scans for the magic value, buffers only the fixed header, and accepts any chunk size, including one-byte chunks.
- Payload data is copied from received chunks while a frame is in progress, so callers may safely reuse input buffers between `push` calls. The decoder does not preallocate from the declared length. It checks the configured limit first and only returns a payload after the CRC is valid.
- A failed CRC consumes the declared candidate frame through its CRC field before returning to magic scanning. This prevents magic-looking bytes embedded in corrupted payload data from being mistaken for nested frames while still recovering the next frame at a known boundary.
- The default maximum payload length is 16 MiB. Pass `maxPayloadLength` to `FrameDecoder` to choose a different limit.

## Build and test

Node.js 22.6 or newer is required because the zero-dependency build uses Node's built-in TypeScript type-stripping API and the tests use Node's built-in test runner.

```sh
npm run build
npm test
```

No runtime, test, or build package dependencies are required. `npm run build` creates runnable JavaScript files in `dist/` from the TypeScript sources.

## CLI

Encode one input file as one frame:

```sh
node dist/cli.js encode input.bin frame.dat
```

Decode a file containing one or more frames into `frame-0001.bin`, `frame-0002.bin`, and so on:

```sh
node dist/cli.js decode frame.dat decoded-frames
```

The decoder reports CRC, truncation, and oversized-payload errors to stderr and continues recovering later valid frames. The decode command returns exit code `1` if any frame errors were reported, even when valid frames were written; input or filesystem failures also return exit code `1`.

## Library example

```ts
import { encodeFrame, FrameDecoder } from 'framevault';

const encoded = encodeFrame(new Uint8Array([1, 2, 3]), { flags: 4 });
const decoder = new FrameDecoder({ maxPayloadLength: 1024 });

const events = [
  ...decoder.push(encoded.subarray(0, 5)),
  ...decoder.push(encoded.subarray(5)),
  ...decoder.finish()
];

for (const event of events) {
  if (event.type === 'frame') {
    console.log(event.frame.payload);
  } else {
    console.error(event.error.message);
  }
}
```
