/**
 * Password hashing admin memakai PBKDF2-SHA256 (WebCrypto, tersedia di Workers).
 * Format tersimpan: pbkdf2$<iterations>$<salt base64>$<hash base64>
 */

const PREFIX = "pbkdf2";
const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const encoder = new TextEncoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function derive(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  // Salinan memastikan salt memakai ArrayBuffer biasa (bukan SharedArrayBuffer),
  // sesuai tipe BufferSource pada WebCrypto.
  const saltBytes = new Uint8Array(salt);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: saltBytes, iterations, hash: "SHA-256" },
    key,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await derive(password, salt, ITERATIONS);
  return [PREFIX, ITERATIONS, toBase64(salt), toBase64(hash)].join("$");
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;
  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  try {
    const salt = fromBase64(parts[2]);
    const expected = fromBase64(parts[3]);
    const actual = await derive(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Lakukan kerja hash yang setara saat email tidak ditemukan, supaya waktu respons
 * tidak membocorkan keberadaan akun.
 */
export async function consumePasswordWork(password: string): Promise<void> {
  const salt = new Uint8Array(SALT_LENGTH);
  await derive(password, salt, ITERATIONS);
}
