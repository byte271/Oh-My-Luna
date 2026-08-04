const CRC32_POLYNOMIAL = 0xedb88320;
const CRC32_INITIAL = 0xffffffff;

const CRC32_TABLE = createCrc32Table();

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < table.length; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 0
        ? value >>> 1
        : (value >>> 1) ^ CRC32_POLYNOMIAL;
    }

    table[index] = value >>> 0;
  }

  return table;
}

function updateCrc32(state: number, bytes: Uint8Array): number {
  let value = state >>> 0;

  for (let index = 0; index < bytes.byteLength; index += 1) {
    const tableIndex = (value ^ bytes[index]!) & 0xff;
    value = (value >>> 8) ^ CRC32_TABLE[tableIndex]!;
  }

  return value >>> 0;
}

/** Return the standard CRC-32/ISO-HDLC checksum as an unsigned 32-bit number. */
export function crc32(bytes: Uint8Array): number {
  return (updateCrc32(CRC32_INITIAL, bytes) ^ 0xffffffff) >>> 0;
}

/** Compute one CRC over several contiguous views without concatenating them. */
export function crc32Chunks(chunks: readonly Uint8Array[]): number {
  let state = CRC32_INITIAL;

  for (const chunk of chunks) {
    state = updateCrc32(state, chunk);
  }

  return (state ^ 0xffffffff) >>> 0;
}

