/**
 * Borsh-compatible primitives for serializing Anchor instruction arguments.
 *
 * We only need primitive types: fixed byte arrays (raw data, without a
 * length-prefix), u8/u64/i64 (8-byte little-endian).
 */

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, a) => acc + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

export function u8(value: number): Uint8Array {
  return Uint8Array.of(value & 0xff);
}

export function u64le(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigUint64(0, value, true);
  return buf;
}

export function i64le(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  new DataView(buf.buffer).setBigInt64(0, value, true);
  return buf;
}

export function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}
