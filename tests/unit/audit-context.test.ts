import { describe, expect, it, vi } from "vitest";

describe("audit context", () => {
  it("is shared by every instance of the module (Next.js loads it once per layer)", async () => {
    const a = await import("@/server/audit/context");
    vi.resetModules();
    const b = await import("@/server/audit/context");
    expect(a).not.toBe(b);
    const seen = await a.runWithAuditContext({ actorId: "u1", source: "ui" }, async () => b.getAuditContext());
    expect(seen).toEqual({ actorId: "u1", source: "ui", batchId: null, comment: null });
  });

  it("awaits lazy thenables inside the context", async () => {
    const { runWithAuditContext, getAuditContext } = await import("@/server/audit/context");
    // Mimics a PrismaPromise: nothing runs until then() is called.
    const lazy = { then: (resolve: (v: unknown) => void) => resolve(getAuditContext()?.actorId) };
    await expect(runWithAuditContext({ actorId: "u2", source: "system" }, () => lazy)).resolves.toBe("u2");
    expect(getAuditContext()).toBeUndefined();
  });

  it("nests: the innermost context wins", async () => {
    const { runWithAuditContext, getAuditContext } = await import("@/server/audit/context");
    const inner = await runWithAuditContext({ actorId: "outer", source: "ui" }, () =>
      runWithAuditContext({ actorId: null, source: "import", batchId: "b1" }, async () => getAuditContext()),
    );
    expect(inner).toEqual({ actorId: null, source: "import", batchId: "b1", comment: null });
  });
});
