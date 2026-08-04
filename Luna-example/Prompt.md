Project name: FrameVault



Create a dependency-free TypeScript library and CLI for encoding and decoding binary data frames.



A frame must use this binary layout:



\* 4 bytes: magic value `FVLT`

\* 1 byte: protocol version

\* 1 byte: flags

\* 4 bytes: unsigned payload length, big-endian

\* N bytes: payload

\* 4 bytes: CRC-32 of every byte before the CRC field



Requirements:



1\. Implement a streaming decoder.



&#x20;  \* Input may arrive one byte at a time.

&#x20;  \* Input may contain several frames in one chunk.

&#x20;  \* A frame may span any number of chunks.

&#x20;  \* Garbage may appear before a valid frame.

&#x20;  \* Corrupted frames must not prevent later valid frames from being decoded.

&#x20;  \* Declared payload lengths above a configurable limit must be rejected safely.

&#x20;  \* The decoder must never allocate memory based on an untrusted oversized length.



2\. Implement an encoder.



3\. Implement CRC-32 internally.



&#x20;  \* Do not use an external package.



4\. Provide a CLI:



&#x20;  \* `encode <input-file> <output-file>`

&#x20;  \* `decode <input-file> <output-directory>`

&#x20;  \* Decoding a file containing multiple frames must create one output file per valid frame.

&#x20;  \* Corrupted frames must be reported clearly without stopping recovery of later frames.



5\. Create automated tests covering:



&#x20;  \* empty payload;

&#x20;  \* binary payload containing every byte from 0 through 255;

&#x20;  \* one-byte chunk streaming;

&#x20;  \* multiple frames in one chunk;

&#x20;  \* arbitrary chunk boundaries;

&#x20;  \* garbage before and between frames;

&#x20;  \* invalid CRC;

&#x20;  \* truncated header;

&#x20;  \* truncated payload;

&#x20;  \* oversized declared payload;

&#x20;  \* corrupted frame followed by a valid frame;

&#x20;  \* false magic sequences inside corrupted data;

&#x20;  \* deterministic encoding.



6\. Provide:



&#x20;  \* `package.json`;

&#x20;  \* strict `tsconfig.json`;

&#x20;  \* source files;

&#x20;  \* tests;

&#x20;  \* README;

&#x20;  \* commands for build, test, and CLI execution.



Constraints:



\* Use only Node.js built-in APIs.

\* Do not install runtime or test dependencies.

\* Do not use Git history, external repositories, web search, or copied implementations.

\* Do not merely describe the project. Create all files and run the tests.

\* Inspect the final directory and remove temporary or generated junk.

\* Do not claim completion unless the build and full test suite pass.



The final response must state:



\* the architecture;

\* important safety decisions;

\* files created;

\* exact commands executed;

\* exact test results;

\* any remaining limitation.

