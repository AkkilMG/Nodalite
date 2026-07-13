/**
 * PBKDF2 password hashing using WebCrypto. Works across all runtimes
 * (Node, Bun, Deno, Cloudflare Workers, Lambda).
 *
 * Hash format: `pbkdf2:sha256:600000:<base64-salt>:<base64-hash>`
 */

const ITERATIONS = 600_000;
const KEY_LENGTH = 32;
const ALGORITHM = "PBKDF2";

function toBuf(arr: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(arr.byteLength);
  new Uint8Array(buf).set(arr);
  return buf;
}

function base64Encode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64Decode(str: string): ArrayBuffer {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Hash a password using PBKDF2 with SHA-256.
 * Returns a portable hash string that includes the algorithm, iterations, salt, and hash.
 */
export async function hashPassword(password: string, opts?: { iterations?: number }): Promise<string> {
  const iterations = opts?.iterations ?? ITERATIONS;
  const saltArr = new Uint8Array(16);
  crypto.getRandomValues(saltArr);
  const salt = toBuf(saltArr);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toBuf(new TextEncoder().encode(password)),
    ALGORITHM,
    false,
    ["deriveBits"],
  );

  const hash = await crypto.subtle.deriveBits(
    { name: ALGORITHM, salt, iterations, hash: "SHA-256" },
    keyMaterial,
    KEY_LENGTH * 8,
  );

  return `pbkdf2:sha256:${iterations}:${base64Encode(salt)}:${base64Encode(hash)}`;
}

/**
 * Verify a password against a hash string produced by `hashPassword`.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyPassword(password: string, hashString: string): Promise<boolean> {
  const parts = hashString.split(":");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== "sha256") {
    return false;
  }

  const iterations = parseInt(parts[2]!, 10);
  if (isNaN(iterations) || iterations <= 0) return false;

  const salt = base64Decode(parts[3]!);
  const expectedHash = base64Decode(parts[4]!);

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    toBuf(new TextEncoder().encode(password)),
    ALGORITHM,
    false,
    ["deriveBits"],
  );

  const derivedBits = await crypto.subtle.deriveBits(
    { name: ALGORITHM, salt, iterations, hash: "SHA-256" },
    keyMaterial,
    expectedHash.byteLength * 8,
  );

  const derivedHash = new Uint8Array(derivedBits);
  const expected = new Uint8Array(expectedHash);

  // Constant-time comparison
  if (derivedHash.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < derivedHash.length; i++) {
    result |= derivedHash[i]! ^ expected[i]!;
  }
  return result === 0;
}
