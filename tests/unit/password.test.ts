import { describe, expect, it } from "vitest";
import {
  ARGON2_OPTIONS,
  getCommonPasswords,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from "@/server/auth/password";

describe("hashPassword / verifyPassword", () => {
  it("hashes with argon2id and the OWASP parameters", async () => {
    const hash = await hashPassword("Un-mot-de-passe-solide-42");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(ARGON2_OPTIONS).toMatchObject({ memoryCost: 19456, timeCost: 2, parallelism: 1 });
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("Un-mot-de-passe-solide-42");
    await expect(verifyPassword(hash, "Un-mot-de-passe-solide-42")).resolves.toBe(true);
    await expect(verifyPassword(hash, "un-mot-de-passe-solide-42")).resolves.toBe(false);
    await expect(verifyPassword(hash, "")).resolves.toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("Même-mot-de-passe-123")).not.toBe(await hashPassword("Même-mot-de-passe-123"));
  });

  it("returns false (no throw) for a malformed hash", async () => {
    await expect(verifyPassword("not-a-hash", "whatever")).resolves.toBe(false);
  });
});

describe("validatePasswordPolicy", () => {
  it("accepts a long, uncommon password", () => {
    expect(validatePasswordPolicy("entrepôt vert sous la pluie", "camille.martin@atlas.local")).toEqual({ ok: true });
  });

  it("rejects passwords shorter than 12 characters", () => {
    const result = validatePasswordPolicy("Court-1!", "a@b.c");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.errors.join()).toMatch(/au moins 12 caractères/);
    expect(validatePasswordPolicy("a".repeat(11) + "é", null).ok).toBe(true); // 12 characters exactly
  });

  it("rejects passwords longer than 128 characters", () => {
    const result = validatePasswordPolicy("x".repeat(129) + "Q", null);
    expect(!result.ok && result.errors.join()).toMatch(/au plus 128 caractères/);
    expect(validatePasswordPolicy("Qz".repeat(64), null).ok).toBe(true);
  });

  it("rejects common passwords, case-insensitively", () => {
    expect(getCommonPasswords().size).toBeGreaterThanOrEqual(900);
    for (const common of ["AZERTY123456", "MotDePasse2024", "passwordpassword", "Carrefour2026"]) {
      const result = validatePasswordPolicy(common, null);
      expect(result.ok, common).toBe(false);
      expect(!result.ok && result.errors.join()).toMatch(/trop courant/);
    }
  });

  it("rejects a password containing the email local part", () => {
    const result = validatePasswordPolicy("Bonjour-Camille.Martin-!", "camille.martin@atlas.local");
    expect(!result.ok && result.errors.join()).toMatch(/identifiant de l'adresse email/);
  });

  it("ignores very short local parts (would reject too much)", () => {
    expect(validatePasswordPolicy("une phrase de passe longue", "al@atlas.local").ok).toBe(true);
  });
});
