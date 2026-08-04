# FrameVault

FrameVault is a dependency-free TypeScript library and Node.js CLI for framing
binary data. It uses only Node.js built-ins at runtime and implements CRC-32
internally.

## Requirements

- Node.js 22.6 or newer.
- No `npm install` step is required. The build and tests use Node's built-in
  TypeScript type stripping and test runner.

## Frame format

Each frame is encoded in network byte order:

| Size | Field |
| ---: | --- |
| 4 bytes | ASCII magic `FVLT` |
| 1 byte | Protocol version |
| 1 byte | Flags |
| 4 bytes | Unsigned payload length, big-endian |
| N bytes | Payload |
| 4 bytes | CRC-32/ISO-HDLC of every preceding byte |

The encoder defaults to protocol version `1` and flags `0`. The CRC uses the
standard reflected polynomial `0xEDB88320`, an initial value of `0xffffffff`,
and a final XOR of `0xffffffff`.

## Library usage

```ts
import { encodeFrame, FrameDecoder } from "framevault";

const encoded = encodeFrame(new Uint8Array([1, 2, 3]));
const decoder = new FrameDecoder({ maxPayloadLength: 1024 * 1024 });

for (const event of decoder.push(encoded.subarray(0, 4))) {
  if (event.type === "frame") console.log(event.frame.payload);
}

for (const event of decoder.push(encoded.subarray(4))) {
  if (event.type === "frame") console.log(event.frame.payload);
  else console.error(event.error.message);
}

for (const event of decoder.end()) {
  if (event.type === "error") console.error(event.error.message);
}
```

`FrameDecoder.push()` accepts any `Uint8Array`, including one byte at a time,
and returns frame or error events. `end()` reports an incomplete header,
payload, or CRC. Garbage is skipped. CRC failures, oversized lengths, and later
valid frames are handled independently.

## Safety and recovery

- The default maximum payload is 16 MiB and can be changed with
  `maxPayloadLength`.
- The decoder reads the fixed-size header before considering an allocation.
  Oversized lengths are rejected before any payload-sized allocation.
- Candidate bytes are retained only as needed for CRC validation and recovery;
  valid payloads are copied before buffered bytes are discarded.
- After corruption, later magic candidates are checked independently, so a
  false `FVLT` sequence inside bad data cannot permanently consume a later
  valid frame.

## CLI

Build first:

```sh
npm run build
```

Encode one input file into one frame:

```sh
npm run encode -- input.bin output.frame
```

Decode a file containing one or more frames:

```sh
npm run decode -- input.frame decoded/
```

The decoder writes `frame-000001.bin`, `frame-000002.bin`, and so on. Decode
errors are printed to stderr, later valid frames are still written, and the
command exits with status `1` if any errors occurred. Set
`FRAMEVAULT_MAX_PAYLOAD_LENGTH` to override the CLI's default limit.

## Build and tests

```sh
npm run build
npm run typecheck
npm test
```

The test suite covers empty and binary payloads, byte-wise streaming, multiple
frames, arbitrary boundaries, garbage, CRC failures, truncation, oversized
lengths, corrupted-frame recovery, false magic sequences, deterministic
encoding, and CLI behavior.

