import { describe, expect, it } from "vitest";
import { ADMIN_SECTIONS, adminSectionsFor } from "@/config/admin";
import { navItemsFor } from "@/config/navigation";

describe("administration sections", () => {
  it("an administrator sees every section; editors and readers none (and no « Administration » entry)", () => {
    expect(adminSectionsFor("admin").map((s) => s.href)).toEqual(ADMIN_SECTIONS.map((s) => s.href));
    expect(adminSectionsFor("editor")).toEqual([]);
    expect(adminSectionsFor("viewer")).toEqual([]);
    expect(navItemsFor("editor").map((i) => i.href)).not.toContain("/admin");
  });

  it("each section names the permission checked by its page", () => {
    expect(Object.fromEntries(ADMIN_SECTIONS.map((s) => [s.href, s.permission]))).toEqual({
      "/admin/operations": "settings:manage",
      "/admin/users": "user:manage",
      "/admin/audit": "audit:read",
      "/admin/imports": "import:run",
      "/admin/enrichment": "enrichment:apply",
    });
  });
});
