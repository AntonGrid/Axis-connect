import bs58 from "bs58";

/** base58 → байты (Bitcoin alphabet, как Solana PublicKey). */
export function base58Encode(bytes: Uint8Array): string {
  return bs58.encode(bytes);
}

export function base58Decode(text: string): Uint8Array {
  return new Uint8Array(bs58.decode(text));
}

const HEX = "0123456789abcdef";

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += HEX[(bytes[i] >> 4) & 0x0f];
    out += HEX[bytes[i] & 0x0f];
  }
  return out;
}

/** "a1b2..." или "0xA1B2" (регистронезависимо) → байты. */
export function hexToBytes(hex: string): Uint8Array {
  let clean = hex.trim();
  if (clean.startsWith("0x") || clean.startsWith("0X")) clean = clean.slice(2);
  if (clean.length % 2 !== 0) throw new Error("hex: нечётная длина");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) throw new Error("hex: некорректные символы");
    out[i] = byte;
  }
  return out;
}

/** base64 → байты. Работает в браузере (btoa/atob). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
