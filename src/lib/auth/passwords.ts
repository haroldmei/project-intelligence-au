// argon2id password helpers — contract.security.password_hashing = argon2id
// OWASP 2024 recommended params: memory=19MiB, iterations=2, parallelism=1
// bcrypt is explicitly in contract.not_in_stack — do NOT substitute.
import argon2 from "argon2";

const ARGON2_OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,       // iterations
  parallelism: 1,
};

/**
 * Hash a plaintext password with argon2id.
 * Never log the returned hash in plaintext.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verify a plaintext password against a stored argon2id hash.
 * Uses constant-time comparison internally.
 */
export async function verifyPassword(
  hash: string,
  password: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, password, ARGON2_OPTIONS);
  } catch {
    // malformed hash — treat as mismatch
    return false;
  }
}

/**
 * Minimum password policy:
 * - length ≥ 12 (no max per NIST SP 800-63B)
 * zxcvbn strength ≥ 3 check is done client-side in the signup form;
 * server enforces only the minimum length.
 */
export function validatePasswordPolicy(password: string): string | null {
  if (password.length < 12) {
    return "Password must be at least 12 characters.";
  }
  return null;
}
