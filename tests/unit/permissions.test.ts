import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACTIONS, assertCan, can, ForbiddenError, PERMISSIONS, type Action } from "@/server/auth/permissions";
import { navItemsFor } from "@/config/navigation";

/** Expected matrix, written independently from the implementation. */
const EXPECTED: Record<Action, { viewer: boolean; editor: boolean; admin: boolean }> = {
  "site:read": { viewer: true, editor: true, admin: true },
  "export:read": { viewer: true, editor: true, admin: true },
  "finance:read": { viewer: true, editor: true, admin: true },
  "site:write": { viewer: false, editor: true, admin: true },
  "site:archive": { viewer: false, editor: false, admin: true },
  "equipment:write": { viewer: false, editor: true, admin: true },
  "document:upload": { viewer: false, editor: true, admin: true },
  "plan:calibrate": { viewer: false, editor: true, admin: true },
  "import:run": { viewer: false, editor: false, admin: true },
  "enrichment:apply": { viewer: false, editor: false, admin: true },
  "user:manage": { viewer: false, editor: false, admin: true },
  "audit:read": { viewer: false, editor: false, admin: true },
  "settings:manage": { viewer: false, editor: false, admin: true },
};

const ROLES = ["viewer", "editor", "admin"] as const;
const cases = ROLES.flatMap((role) => ACTIONS.map((action) => [role, action, EXPECTED[action][role]] as const));

describe("permission matrix", () => {
  it("covers every action", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ACTIONS].sort());
    expect(cases).toHaveLength(39);
  });

  it.each(cases)("%s × %s → %s", (role, action, allowed) => {
    expect(can(role, action)).toBe(allowed);
    if (allowed) expect(() => assertCan(role, action)).not.toThrow();
    else expect(() => assertCan(role, action)).toThrow(ForbiddenError);
  });

  it("grants nothing to an unknown or missing role", () => {
    for (const action of ACTIONS) {
      expect(can("superadmin", action)).toBe(false);
      expect(can(null, action)).toBe(false);
      expect(can(undefined, action)).toBe(false);
    }
  });

  it("throws a typed ForbiddenError carrying the action", () => {
    try {
      assertCan("viewer", "user:manage");
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).action).toBe("user:manage");
      expect((error as Error).message).toBe("Accès refusé.");
    }
  });

  it("is monotonic: editor ⊇ viewer, admin ⊇ editor", () => {
    for (const action of PERMISSIONS.viewer) expect(PERMISSIONS.editor.has(action)).toBe(true);
    for (const action of PERMISSIONS.editor) expect(PERMISSIONS.admin.has(action)).toBe(true);
  });
});

describe("navigation by role", () => {
  it("shows « Administration » to admins only", () => {
    expect(navItemsFor("admin").map((i) => i.label)).toContain("Administration");
    expect(navItemsFor("editor").map((i) => i.label)).not.toContain("Administration");
    expect(navItemsFor("viewer").map((i) => i.label)).toEqual(["Carte", "Sites", "Supervision"]);
  });
});

describe("finance:read", () => {
  it("is granted to the three roles, role by role (withdrawing it is one line of the matrix)", () => {
    for (const role of ROLES) expect(PERMISSIONS[role].has("finance:read")).toBe(true);
    const source = readFileSync(new URL("../../src/server/auth/permissions.ts", import.meta.url), "utf8");
    for (const role of ROLES) expect(source).toMatch(new RegExp(`^\\s*${role}: new Set<Action>\\(\\[.*"finance:read"\\]\\),$`, "m"));
  });
});
