import { describe, expect, it } from "vitest";
import { userChangeRefusal } from "@/domain/users/guards";

const admin = { id: "a1", role: "admin", isActive: true };
const other = { id: "a2", role: "admin", isActive: true };
const editor = { id: "e1", role: "editor", isActive: true };

describe("userChangeRefusal", () => {
  it("nobody changes their own role nor deactivates themselves", () => {
    expect(userChangeRefusal("a1", admin, { kind: "role", role: "viewer" }, 3)).toMatch(/propre rôle/);
    expect(userChangeRefusal("a1", admin, { kind: "deactivate" }, 3)).toMatch(/propre compte/);
  });

  it("the last active administrator can be neither demoted nor deactivated", () => {
    expect(userChangeRefusal("x", other, { kind: "role", role: "editor" }, 1)).toMatch(/dernier administrateur actif/);
    expect(userChangeRefusal("x", other, { kind: "deactivate" }, 1)).toMatch(/dernier administrateur actif/);
    // With another active administrator, both are allowed.
    expect(userChangeRefusal("a1", other, { kind: "role", role: "editor" }, 2)).toBeNull();
    expect(userChangeRefusal("a1", other, { kind: "deactivate" }, 2)).toBeNull();
  });

  it("an inactive administrator does not count: demoting it is allowed", () => {
    expect(userChangeRefusal("a1", { ...other, isActive: false }, { kind: "role", role: "viewer" }, 1)).toBeNull();
  });

  it("ordinary changes, invalid role and no-op changes", () => {
    expect(userChangeRefusal("a1", editor, { kind: "role", role: "admin" }, 1)).toBeNull();
    expect(userChangeRefusal("a1", editor, { kind: "deactivate" }, 1)).toBeNull();
    expect(userChangeRefusal("a1", editor, { kind: "role", role: "superuser" }, 1)).toBe("Rôle invalide.");
    expect(userChangeRefusal("a1", editor, { kind: "role", role: "editor" }, 1)).toMatch(/déjà ce rôle/);
    expect(userChangeRefusal("a1", editor, { kind: "activate" }, 1)).toMatch(/déjà actif/);
    expect(userChangeRefusal("a1", { ...editor, isActive: false }, { kind: "activate" }, 1)).toBeNull();
    expect(userChangeRefusal("a1", { ...editor, isActive: false }, { kind: "deactivate" }, 1)).toMatch(/déjà désactivé/);
  });
});
