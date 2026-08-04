const CRC32_POLYNOMIAL = 0xedb88320;
export const CRC32_INITIAL = 0xffffffff;

const CRC32_TABLE = createCrc32Table();

function createCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);

  for (let value = 0; value < table.length; value += 1) {
    let remainder = value;

    for (let bit = 0; bit < 8; bit += 1) {
      remainder = (remainder & 1) === 1
        ? (remainder >>> 1) ^ CRC32_POLYNOMIAL
        : remainder >>> 1;
    }

    table[value] = remainder >>> 0;
  }

  return table;
}

export function updateCrc32(state: number, data: Uint8Array): number {
  let remainder = state >>> 0;

  for (const byte of data) {
    const tableValue = CRC32_TABLE[(remainder ^ byte) & 0xff] ?? 0;
    remainder = (remainder >>> 8) ^ tableValue;
  }

  return remainder >>> 0;
}

export function finalizeCrc32(state: number): number {
  return (state ^ 0xffffffff) >>> 0;
}

export function crc32(data: Uint8Array): number {
  return finalizeCrc32(updateCrc32(CRC32_INITIAL, data));
}
