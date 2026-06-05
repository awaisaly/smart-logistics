import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Password hashing uses Node's built-in scrypt (memory-hard, no extra deps).
// Stored format: "scrypt:<saltHex>:<derivedHex>" so the salt travels with the hash.
const SCRYPT_KEYLEN = 64;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const derived = scryptSync(plain, salt, SCRYPT_KEYLEN);
  // Constant-time compare; guard length first since timingSafeEqual throws on mismatch.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

// Opaque, high-entropy token returned to the client (e.g. refresh tokens).
export function newOpaqueToken(): string {
  return randomBytes(48).toString("hex");
}

// One-way fingerprint stored at rest so a DB leak can't replay tokens directly.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
