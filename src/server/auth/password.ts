import "server-only";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { hash, verify } from "@node-rs/argon2";

/** `Algorithm.Argon2id` (a const enum, not importable with isolatedModules). */
const ARGON2ID = 2;

/**
 * argon2id parameters recommended by OWASP (Password Storage Cheat Sheet):
 * 19 MiB of memory, 2 iterations, 1 degree of parallelism.
 */
export const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Password length bounds (NIST SP 800-63B inspired: length over composition rules). */
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Hashes a password with argon2id (random salt, PHC string output).
 * @param password - Plain-text password (never logged).
 * @returns The PHC-encoded hash, e.g. `$argon2id$v=19$m=19456,t=2,p=1$…`.
 */
export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Checks a password against a stored hash, in constant time.
 * @param passwordHash - PHC string produced by {@link hashPassword}.
 * @param password - Candidate password.
 * @returns `true` if it matches; `false` otherwise, including for a malformed hash.
 */
export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * A valid argon2id hash of a random secret, computed once. Verifying against it
 * when the account does not exist makes the response time indistinguishable
 * from a wrong password on an existing account.
 */
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(crypto.randomUUID());
  return dummyHash;
}

let commonPasswords: ReadonlySet<string> | undefined;

/**
 * The embedded list of common passwords (`common-passwords.txt`), lower-cased.
 * Read once from disk; the file ships with the application (no download).
 */
export function getCommonPasswords(): ReadonlySet<string> {
  if (!commonPasswords) {
    const file = join(process.cwd(), "src", "server", "auth", "common-passwords.txt");
    commonPasswords = new Set(
      readFileSync(file, "utf8")
        .split(/\r?\n/)
        .map((line) => line.trim().toLowerCase())
        .filter((line) => line !== "" && !line.startsWith("#")),
    );
  }
  return commonPasswords;
}

/** Result of {@link validatePasswordPolicy}. */
export type PasswordPolicyResult = { ok: true } | { ok: false; errors: string[] };

/**
 * Checks the password policy: 12 to 128 characters, not a common password,
 * does not contain the local part of the email (when it has 3+ characters).
 * No composition rules (NIST SP 800-63B).
 *
 * @param password - Candidate password.
 * @param email - Account email (its local part must not appear in the password).
 * @returns `{ ok: true }` or the list of French error messages.
 */
export function validatePasswordPolicy(password: string, email?: string | null): PasswordPolicyResult {
  const errors: string[] = [];
  const length = [...password].length;
  if (length < PASSWORD_MIN_LENGTH) errors.push(`Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caractères.`);
  if (length > PASSWORD_MAX_LENGTH) errors.push(`Le mot de passe doit contenir au plus ${PASSWORD_MAX_LENGTH} caractères.`);

  const lower = password.toLowerCase();
  if (getCommonPasswords().has(lower)) errors.push("Ce mot de passe est trop courant.");

  const localPart = email?.split("@")[0]?.trim().toLowerCase() ?? "";
  if (localPart.length >= 3 && lower.includes(localPart)) {
    errors.push("Le mot de passe ne doit pas contenir l'identifiant de l'adresse email.");
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
